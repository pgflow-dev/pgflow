PROMPT = """
Answer question in concise manner using bullet points and half sentences.

Question: {question}
"""

from chains.hypothetical_answers import chain as hypothetical_answers
from langchain_openai.chat_models import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

chain = (
    ChatPromptTemplate.from_template(PROMPT)
    | ChatOpenAI(model="gpt-3.5-turbo-1106")
    | StrOutputParser()
)

if __name__ == "__main__":
    question = "What is the capital of Canada?"

    while True:
        results = chain.invoke(dict(question=question))
        print(results)
        question = input("Question: ")
