from operator import itemgetter
from typing import List

from app.prefixed_embeddings import PrefixedEmbeddings
from app.utils import init_supabase_vectorstore
from dotenv import load_dotenv
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.retrievers import BaseRetriever
from langchain_core.runnables import (Runnable, RunnableLambda,
                                      RunnableParallel, RunnablePassthrough)
from langchain_core.vectorstores import VectorStoreRetriever
from langchain_openai.chat_models import ChatOpenAI
from supabase.client import Client, create_client

load_dotenv()
import os

from rich.pretty import pprint

store = init_supabase_vectorstore()

def kind_retriever(kind: str, threshold=0.5) -> VectorStoreRetriever:
    return store.as_retriever(
        search_kwargs={
            'filter': {'kind': kind},
            'score_threshold': threshold
        },
        search_type='similarity_score_threshold'
    )

rephrase_chain = (
    {"question": RunnablePassthrough()}
    | ChatPromptTemplate.from_template("Sparafrazuj wiadomość tak, aby była niezależnym pytaniem: {question}")
    | ChatOpenAI(model=os.environ['OPENAI_MODEL'])
    | StrOutputParser()
)

hypothetical_answer_chain = (
    {"question": RunnablePassthrough()}
    | ChatPromptTemplate.from_template("Na podstawie zadanego pytania, utwórz hipotetyczny paragraf z prawa oświatowego dotyczący tego pytania: {question}")
    | ChatOpenAI(model=os.environ['OPENAI_MODEL'])
    | StrOutputParser()
)

break_down_chain = (
    {"question": RunnablePassthrough()}
    | ChatPromptTemplate.from_template("Spróbuj podzielić pytanie na kilka prostych zapytań, tak, aby uzyskane odpowiedzi pomogły w odpowiedzeniu na oryginalne pytanie. Nie komentuj, nie opisuj. Wypisz po jednym pomocniczym pytaniu na linię. Pytania pomocnicze mają pomóc w odnalezieniu odpowiednich paragrafów w Ustawie Prawo Oświatowe - tylko w takim kontekście twórz pomocnicze pytania. Oryginalne pytanie: {question}")
    | ChatOpenAI(model=os.environ['OPENAI_MODEL'])
    | StrOutputParser()
)

summarize_chain = (
    {"passage": RunnablePassthrough()}
    | ChatPromptTemplate.from_template("Podsumuj w jednym zwięzłym zdaniu (lub krócej - w kilku słowach): {passage}")
    | ChatOpenAI(model=os.environ['OPENAI_MODEL'])
    | StrOutputParser()
)

lex_docs_retriever = RunnableParallel({
    # "chapters": kind_retriever(kind='Chapter', threshold=0.7),
    "article": kind_retriever(kind='Article', threshold=0.7),
    "paragraph": kind_retriever(kind='Paragraph', threshold=0.7),
    "point": kind_retriever(kind='Point', threshold=0.7),
    "subpoint": kind_retriever(kind='Subpoint', threshold=0.7),
})

get_docs = RunnableLambda(lambda docs: [doc.page_content for doc in docs])

def format_metadata(doc):
    meta = doc.metadata
    parts = ['-']

    # if meta.get('chapter_no'):
    #     parts.append(f"Rozdział {meta.get('chapter_no')}")

    if meta.get('article_no'):
        parts.append(f"art. {meta.get('article_no')}")

    if meta.get('paragraph_no'):
        parts.append(f"ust. {meta.get('paragraph_no')}")

    if meta.get('point_no'):
        parts.append(f"pkt {meta.get('point_no')}")

    if meta.get('subpoint_no'):
        parts.append(f"lit. {meta.get('subpoint_no')}")

    return ' '.join(parts)


def format_doc(doc):
    return f"{format_metadata(doc)}: { doc.page_content}"

format_multiple = RunnableLambda(lambda docs: [format_doc(doc) for doc in docs])

def merger(input: dict):
    merged = []
    merged.extend(input['article'])
    merged.extend(input['paragraph'])
    merged.extend(input['point'])
    merged.extend(input['subpoint'])

    return merged

def dbg(input):
    pprint(input)
    return input

qa_template = """
    Odpowiedz na pytanie z zakresu edukacji i prawa oświatowego w polsce
    wyłącznie na podstawie podanego kontekstu.
    Jeśli potrzebnej informacji nie ma w podanym kontekście, nie wymyślaj odpowiedzi,
    zamiast tego powiedz coś w rodzaju "Nie mam wystarczających danych".

    Jeśli będziesz cytował konkretne ustępy lub paragrafy, upewnij się,
    że umieszczasz informacje o źródle (np. "Zgodnie z art. 1 ust. 2")

    Kontekst z Ustawy o Prawie Oświatowym:
    {context}

    Pytanie: {question}
"""

reranker_template = """
Nie odpowiadaj na pytanie, ale zwróć tylko te informacje z kontekstu,
które są według ciebie istotne, aby odpowiedzieć na pytanie.

Kontekst:
{context}

Pytanie: {question}
"""

reranker = (
    ChatPromptTemplate.from_template(reranker_template)
    | ChatOpenAI(model=os.environ['OPENAI_MODEL'])
)

chain = (
    {
        "question": RunnablePassthrough(),
        "context": hypothetical_answer_chain | summarize_chain | dbg
            | lex_docs_retriever
            | {"article": itemgetter("article") | format_multiple | dbg,
               "paragraph": itemgetter("paragraph") | format_multiple | dbg,
               "point": itemgetter("point") | format_multiple | dbg,
               "subpoint": itemgetter("subpoint") | format_multiple | dbg}
            | merger
            | RunnableLambda(lambda texts: '\n'.join(texts)) }
    # | RunnableLambda(dbg)
    # | {"question": itemgetter("question"), "context":  dbg }
    | ChatPromptTemplate.from_template(qa_template)
    | ChatOpenAI(model=os.environ['OPENAI_MODEL'])
    | StrOutputParser()
)

# question = "jakiego wsparcia może udzielić szkoła uczniowi z zespołem aspergera?"
# question = "jeśli nauczyciel jest ciągle chory i nie jest obecny na lekcjach przez więcej niż połowe czasu, czy można go zwolnić?"
# question =
question = "co powinni zrobić rodzice dziecka, gdy nauczyciel od polskiego jest niedysponowany przez 3/4 roku i na zajęciach są ciągle zastępstwa?"
# chain = break_down_chain | hypothetical_answer_chain

if __name__ == '__main__':
    # print(f'====== chain invoked: {question}')
    question = input("Question: ")
    results = chain.invoke(question)

    print('====== results')
    pprint(results)
