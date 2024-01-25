from dotenv import load_dotenv
load_dotenv()
import os

from langchain_openai.chat_models import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_community.vectorstores.supabase import SupabaseVectorStore
from app.prefixed_embeddings import PrefixedEmbeddings
from rich.pretty import pprint
from supabase.client import Client, create_client
from langchain_core.runnables import RunnablePassthrough


template = """Odpowiedz na pytanie wyłącznie używając poniższego kontekstu:
{context}

Pytanie: {question}
"""

prompt = ChatPromptTemplate.from_template(template)

model_name = os.environ["OPENAI_MODEL"]
model = ChatOpenAI(model=model_name)

supabase: Client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])
store = SupabaseVectorStore(
    embedding=PrefixedEmbeddings(),
    client=supabase,
    table_name='documents',
    query_name='match_documents',
)

opts = dict(
    search_kwargs=dict(
        # filter=dict(kind=kind),
        score_threshold=0.75
    ),
    search_type='similarity_score_threshold'
)

chain = (
    {"context": store.as_retriever(**opts), "question": RunnablePassthrough()}
    | prompt
    | model
    | StrOutputParser()
)

question = "jakiego wsparcia może udzielić szkoła uczniowi z zespołem aspergera?"

while True:
    if question == "exit":
        break

    response = chain.invoke(question)
    pprint(response)

    question = input("Question: ")
