from dotenv import load_dotenv

load_dotenv()

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai.chat_models import ChatOpenAI
from utils.parsers import LinesParser

template = """
Na podstawie poniższego pytania utwórz listę pytań pomocniczych, tak aby delikatnie poszerzyć zakres wyszukiwania.
Zanim zwrócisz listę, przekształć każde pytanie w hipotetyczny paragraf z prawa oświatowego, który mógłby zawierać informacje potrzebne do udzieleia odpowiedzi na to hipotetyczne pytanie.
Nie komentuj, nie opisuj - zwróć jedynie listę paragrafów, po 1 na linię, bez numeracji lub innych znaków - tylko zdania.

Ilość paragrafów do zwrócenia: {num_questions}
Oryginalne pytanie: {question}
""".strip()

chain = (
    ChatPromptTemplate.from_template(template)
    | ChatOpenAI(model="gpt-3.5-turbo-1106")
    | StrOutputParser()
    | LinesParser()
)

if __name__ == "__main__":
    from rich.pretty import pprint
    question = "jakiego wsparcia może udzielić szkoła uczniowi z zespołem aspergera?"
    while True:
        if question == "exit":
            break
        response = chain.invoke(dict(question=question, num_questions=5))
        pprint(response)
        question = input("Question: ")

    question = input("Question: ")
