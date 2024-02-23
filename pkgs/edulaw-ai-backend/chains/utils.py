from langchain_core.runnables import Runnable
from rich.pretty import pprint


def qa_repl(chain: Runnable, message: str, message_key: str = "question"):
    while True:
        response = chain.invoke({message_key: message})
        pprint(response)
        print('---------------------------')

        message = input(f"{message_key}: ")
