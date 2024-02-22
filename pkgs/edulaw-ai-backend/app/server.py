from chains.hypothetical_answers import chain as hypothetical_answers
from chains.naive_retrieval import chain as naive_retrieval
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from langserve import add_routes

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

add_routes(app, hypothetical_answers, path='/hypothetical-answers')
add_routes(app, naive_retrieval, path='/naive-retrieval')

@app.get("/")
async def redirect_root_to_docs():
    return RedirectResponse("/docs")

if __name__ == "__main__":
    import os

    import uvicorn

    HTTP_PORT = int(os.environ.get("HTTP_PORT", 8080))

    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
