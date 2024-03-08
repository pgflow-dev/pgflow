from typing import Awaitable, Callable

from app.remote_embeddings import embed_documents, embed_query
from app.utils import init_supabase_client
from chains.context_relevance_test import chain as context_relevance_test
from chains.hierarchical_retriever import chain as hierarchical_qa
from chains.hypothetical_answers import chain as hypothetical_answers
from chains.naive_retrieval import chain as naive_retrieval
from chains.qa_chain import chain as qa_chain
from fastapi import FastAPI, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
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

# embeddings
add_routes(app, embed_query, path='/embed_query')
add_routes(app, embed_documents, path='/embed_documents')

@app.get("/")
async def redirect_root_to_docs():
    return RedirectResponse("/docs")

@app.middleware("http")
async def superadmin_check_middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]):
    if request.method == "OPTIONS":
        return await call_next(request)

    auth_token = request.headers.get("Authorization")
    if not auth_token or not auth_token.startswith("Bearer "):
        return JSONResponse(content={
            "detail": "Authorization token is missing or invalid"
        }, status_code=401)

    # Remove "Bearer " prefix
    auth_token = auth_token[7:]

    print("Authorization token:", auth_token)

    # Log the step of initializing the Supabase client
    print("Initializing Supabase client")

    try:
        from rich.pretty import pprint
        supabase = init_supabase_client(auth_token)

        # Log the step of calling supabase.rpc
        print("Calling supabase.rpc to check if user is superadmin")

        response = supabase.rpc('is_superadmin', {}).execute()

        pprint(response)

        # Check if the response has data and it's True
        if response.data and response.data == True:
            print("User is superadmin, allowing request to continue")
            return await call_next(request)

        print("User is not superadmin, blocking request")
        return JSONResponse(content={"detail": "User is not authorized to access this resource"}, status_code=403)

    except Exception as e:
        print(f"An error occurred: {e}")
        return JSONResponse(content={"detail": "An error occurred while verifying superadmin status"}, status_code=500)

if __name__ == "__main__":
    import os

    import uvicorn

    HTTP_PORT = int(os.environ.get("HTTP_PORT", 8080))

    uvicorn.run(app, host="0.0.0.0", port=HTTP_PORT)
