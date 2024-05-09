from chains.context_relevance_test import chain as context_relevance_test
from chains.edulaw_qa_chain import create_chain as create_edulaw_qa_chain
from chains.hierarchical_retriever import chain as hierarchical_qa
from chains.hypothetical_answers import chain as hypothetical_answers
from chains.joke_chain import chain as joke_chain
from chains.naive_retrieval import chain as naive_retrieval
from chains.qa_chain import chain as qa_chain
from fastapi import APIRouter
from langserve import add_routes

router = APIRouter()

# partial chains
add_routes(router, context_relevance_test, path='/context-relevance')
add_routes(router, hypothetical_answers, path='/hypothetical-answers')
add_routes(router, naive_retrieval, path='/naive-retrieval')

# simple chains
add_routes(router, joke_chain, path='/joke')

# qa chains
add_routes(router, hierarchical_qa, path='/hierarchical-qa')
add_routes(router, qa_chain, path='/qa')
add_routes(router, create_edulaw_qa_chain(), path='/edulaw-qa')

