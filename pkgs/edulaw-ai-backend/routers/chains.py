from chains.context_relevance_test import chain as context_relevance_test
from chains.hierarchical_retriever import chain as hierarchical_qa
from chains.hypothetical_answers import chain as hypothetical_answers
from chains.naive_retrieval import chain as naive_retrieval
from chains.qa_chain import chain as qa_chain
from fastapi import APIRouter
from langserve import add_routes

router = APIRouter()

# partial chains
add_routes(router, context_relevance_test, path='/context-relevance')
add_routes(router, hypothetical_answers, path='/hypothetical-answers')
add_routes(router, naive_retrieval, path='/naive-retrieval')

# qa chains
add_routes(router, hierarchical_qa, path='/hierarchical-qa')
add_routes(router, qa_chain, path='/qa')

