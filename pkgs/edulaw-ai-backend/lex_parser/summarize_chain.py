from dotenv import load_dotenv
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai.chat_models import ChatOpenAI

PROMPT = """
Poniżej jest fragment ustawy o prawie oświatowym w polsce.
Napisz listę tematów, które porusza poniższy tekst.
Pisz tylko tematy, po jednym na linię. Nie pisz nic innego.
Bądź zwięzły ale nie pomijaj detali.

{text}
"""

prompt = ChatPromptTemplate.from_template(PROMPT)

def split_lines(text: str):
    return text.split("\n")

def create_chain():
    return prompt | ChatOpenAI(model="gpt-3.5-turbo-1106") | StrOutputParser() | split_lines
