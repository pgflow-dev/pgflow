import os
from typing import Awaitable, Callable

from app.utils import authorize_superadmin
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from routers.chains import router as chains_router
from routers.chat_completions_proxy import router as chat_completions_router
from routers.models_and_embeddings import router as models_router

# TODO: figure out how to not run it on load
load_dotenv()

app = FastAPI()

### Routes

@app.get("/")
async def redirect_root_to_docs():
    return RedirectResponse("/docs")

app.include_router(chat_completions_router, prefix='/proxy')
app.include_router(models_router, prefix='/models')
app.include_router(chains_router)

### Middlewares

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.middleware("http")
async def superadmin_check_middleware(
    request: Request,
    call_next: Callable[[Request],
    Awaitable[Response]]
    ):

    if request.method == "OPTIONS":
        return await call_next(request)

    if os.environ["ENVIRONMENT"] == "development" and os.environ["DISABLE_AUTH"] == "true":
        return await call_next(request)

    (is_authorized, reason) = authorize_superadmin(request)

    if is_authorized:
        print("Superadmin AUTHORIZED")
        return await call_next(request)
    else:
        print(f"Superadmin authorization FAILED: {reason}")

        return JSONResponse(content={"reason": reason}, status_code=403)

if __name__ == "__main__":
    import os

    import uvicorn

    HTTP_PORT = int(os.environ.get("HTTP_PORT", 8080))

    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
