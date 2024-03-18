from typing import Awaitable, Callable

from app.remote_embeddings import embed_documents, embed_query
from app.utils import authorize_superadmin
from chains.context_relevance_test import chain as context_relevance_test
from chains.hierarchical_retriever import chain as hierarchical_qa
from chains.hypothetical_answers import chain as hypothetical_answers
from chains.naive_retrieval import chain as naive_retrieval
from chains.qa_chain import chain as qa_chain
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from langchain_community.chat_models import ChatOllama
from langchain_groq import ChatGroq
from langchain_openai.chat_models import ChatOpenAI
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

# partial chains
add_routes(app, hypothetical_answers, path='/hypothetical-answers')
add_routes(app, naive_retrieval, path='/naive-retrieval')
add_routes(app, context_relevance_test, path='/context-relevance')

# qa chains
add_routes(app, qa_chain, path='/qa')
add_routes(app, hierarchical_qa, path='/hierarchical-qa')

# models
add_routes(app, ChatOpenAI(model="gpt-3.5-turbo-1106"), path='/models/ChatOpenAI')
add_routes(app, ChatGroq(model="mixtral-8x7b-32768"), path='/models/ChatGroq/mixtral-8x7b')
add_routes(app, ChatGroq(model="llama2-70b-4096"), path='/models/ChatGroq/llama2-70b')
add_routes(app, ChatGroq(model="gemma-7b-it"), path='/models/ChatGroq/gemma-7b-it')

import os

from dotenv import load_dotenv

load_dotenv()
OLLAMA_URL = os.environ.get("OLLAMA_URL")

if OLLAMA_URL is not None:
    add_routes(app, ChatOllama(base_url=OLLAMA_URL, model="dolphin-mixtral"), path='/models/ChatOllama/dolphin-mixtral')
    add_routes(app, ChatOllama(base_url=OLLAMA_URL, model="gemma:2b"), path='/models/ChatOllama/gemma:2b')
    add_routes(app, ChatOllama(base_url=OLLAMA_URL, model="gemma:7b"), path='/models/ChatOllama/gemma:7b')

# embeddings
add_routes(app, embed_query, path='/embed_query')
add_routes(app, embed_documents, path='/embed_documents')

@app.get("/")
async def redirect_root_to_docs():
    return RedirectResponse("/docs")

if os.environ.get('ENVIRONMENT') != 'development':
    @app.middleware("http")
    async def superadmin_check_middleware(
        request: Request,
        call_next: Callable[[Request],
        Awaitable[Response]]
        ):

        if request.method == "OPTIONS":
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
