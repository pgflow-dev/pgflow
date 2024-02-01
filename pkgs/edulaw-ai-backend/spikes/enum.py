# from langchain_openai.chat_models import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
# from langchain_core.output_parsers import StrOutputParser
# from langchain_core.runnables import RunnablePassthrough, RunnableParallel, RunnableLambda, RunnableBranch, RunnbleSequence
from pydantic import BaseModel
from tiktoken import get_encoding

encoding = get_encoding('gpt-3.5')

prompt = ChatPromptTemplate.from_template("""

""")

class LogitBiasEnum(BaseModel):
    enum: dict

    def __call__(self, input: dict):
        return input
