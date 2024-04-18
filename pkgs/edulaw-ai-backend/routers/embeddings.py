from app.remote_embeddings import embed_documents, embed_query
from fastapi import APIRouter
from langserve import add_routes

router = APIRouter()

# embeddings
add_routes(router, embed_query, path='/embed_query')
add_routes(router, embed_documents, path='/embed_documents')




