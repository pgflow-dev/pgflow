from dotenv import load_dotenv

load_dotenv()
import os
from operator import itemgetter

from app.utils import init_supabase_vectorstore
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai.chat_models import ChatOpenAI
from rich.pretty import pprint

template = """Odpowiedz na pytanie wyłącznie używając poniższego kontekstu:
{context}

Pytanie: {question}
"""

prompt = ChatPromptTemplate.from_template(template)

model_name = os.environ["OPENAI_MODEL"]
model = ChatOpenAI(model=model_name)

store = init_supabase_vectorstore()

opts = dict(
    search_kwargs=dict(
        # filter=dict(kind=kind),
        score_threshold=0.75
    ),
    search_type='similarity_score_threshold'
)

chain = (
    {
        "question": itemgetter("question"),
        "context": itemgetter("question") | store.as_retriever()
    }
    | prompt
    | model
    | StrOutputParser()
)

question = "jakiego wsparcia może udzielić szkoła uczniowi z zespołem aspergera?"

if __name__ == "__main__":
    while True:
        if question == "exit":
            break

        response = chain.invoke(question)
        pprint(response)

        question = input("Question: ")
