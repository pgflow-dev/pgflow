from app.remote_embeddings import embed_documents, embed_query
from fastapi import APIRouter
from langserve import add_routes

router = APIRouter()

from dotenv import load_dotenv

load_dotenv()

from langchain_core.runnables import RunnableLambda
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings()

# embeddings
add_routes(router, RunnableLambda(embeddings.embed_query), path='/embed_query')
add_routes(router, RunnableLambda(embeddings.embed_documents), path='/embed_documents')
