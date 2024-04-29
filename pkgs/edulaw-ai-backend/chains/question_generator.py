from dotenv import load_dotenv

load_dotenv()

from chains.utils import qa_repl
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_openai.chat_models import ChatOpenAI
from utils.parsers import LinesParser

chain = (
    ChatPromptTemplate.from_template("""
    Twoim zadaniem jest stworzyć {num} potencjalnych pytań,
    jakie mógłby zadać zatroskany rodzic dziecka w wieku szkolnym w polsce AI asystentowi
    wyspecjalizowanemu w odpowiadaniu na pytania na temat ustawy o prawie oświatowym w polsce.

    Najpierw wymyśl {num} potencjalnych problemów lub trosk takiego rodzica,
    a potem dla każdej z tych trosk zadaj wspomniane pytania.

    Nie twórz pytań, na które się nie da odpowiedzieć używając załączonej treści.
    Zwróć jedno pytanie na linię, bez numeracji lub innych znaków - tylko zdania.

    TREŚĆ:
    {context}
    """)
    | ChatOpenAI(model="gpt-3.5-turbo-1106")
    | StrOutputParser()
    | LinesParser()
)

if __name__ == "__main__":
    question =  "jakiego wsparcia może udzielić szkoła uczniowi z zespołem aspergera?"
    qa_repl(chain, message=question, message_key="context")
