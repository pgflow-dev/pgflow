from dotenv import load_dotenv

load_dotenv()

from chains.utils import qa_repl
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai.chat_models import ChatOpenAI
from utils.parsers import LinesParser

chain = (
    ChatPromptTemplate.from_template("""
    Utwórz 5 hipotetycznych pytań w kontekście prawa oświatowego,
    takich, aby udzielenie na nie odpowiedzi wymagało użycia informacji zawartych w poniższej treści.

    Treść: {context}
    """)
    | ChatOpenAI(model="gpt-3.5-turbo-1106")
    | StrOutputParser()
    | LinesParser()
)

if __name__ == "__main__":
    question =  "jakiego wsparcia może udzielić szkoła uczniowi z zespołem aspergera?"
    qa_repl(chain, message=question, message_key="context")
