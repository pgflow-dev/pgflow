import os

from fastapi import APIRouter
from langchain_community.chat_models import ChatOllama
from langchain_groq import ChatGroq
from langchain_openai.chat_models import ChatOpenAI
from langserve import add_routes

router = APIRouter()

add_routes(router, ChatOpenAI(model="gpt-3.5-turbo-1106"), path='/ChatOpenAI')
add_routes(router, ChatGroq(model="mixtral-8x7b-32768"), path='/ChatGroq/mixtral-8x7b')
add_routes(router, ChatGroq(model="llama2-70b-4096"), path='/ChatGroq/llama2-70b')
add_routes(router, ChatGroq(model="gemma-7b-it"), path='/ChatGroq/gemma-7b-it')

OLLAMA_URL = os.environ.get("OLLAMA_URL")

if OLLAMA_URL is not None:
    add_routes(router, ChatOllama(base_url=OLLAMA_URL, model="dolphin-mixtral"), path='/ChatOllama/dolphin-mixtral')
    add_routes(router, ChatOllama(base_url=OLLAMA_URL, model="gemma:2b"), path='/ChatOllama/gemma:2b')
    add_routes(router, ChatOllama(base_url=OLLAMA_URL, model="gemma:7b"), path='/ChatOllama/gemma:7b')

