from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from langserve import add_routes
from app.qa_chain import chain as qa_chain
from app.slow_qa_chain import chain as slow_qa_chain
from app.retrieval_chain import chain as retrieval_chain
from app.rephrase_chain import chain as rephrase_chain

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

@app.get("/")
async def redirect_root_to_docs():
    return RedirectResponse("/docs")

add_routes(app, qa_chain, path="/edulaw-qa")
add_routes(app, slow_qa_chain, path="/edulaw-qa-v2")
add_routes(app, retrieval_chain, path="/edulaw-retrieval")
add_routes(app, rephrase_chain, path="/rephrase")

if __name__ == "__main__":
    import uvicorn
    import os

    HTTP_PORT = int(os.environ.get("HTTP_PORT", 8080))

    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
