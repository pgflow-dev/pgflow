from datetime import datetime
from typing import Literal, TypedDict

from feed_processor.actors.extract_entities.schema import Schema
from langchain_core.runnables import Runnable, RunnableSequence
from langchain_openai.chat_models import ChatOpenAI
from pydantic import SecretStr

from .prompt import prompt

class InputType(TypedDict):
    input: str
    time: datetime

def create_chain(api_key: str) -> Runnable[InputType, Schema]:
    model = ChatOpenAI(model='gpt-4o', api_key=SecretStr(api_key))

    return RunnableSequence(
        prompt,
            model.with_structured_output(
            schema=Schema,
            method="json_schema",
            strict=True
        )
    ).with_types(input_type=InputType, output_type=Schema)

################################
if __name__ == '__main__':
    import os
    import sys

    from dotenv import load_dotenv
    from rich.pretty import pprint
    load_dotenv()

    chain = create_chain(api_key=os.environ["OPENAI_API_KEY"]).with_config({"run_name": "Extract Entities"})

    # make the file path a first arg
    with open(sys.argv[1], "r") as f:
        input_text = f.read()

    print('----------------------------------------------------------------')
    print(input_text)
    print('----------------------------------------------------------------')
    input = InputType(input=input_text, time=datetime.now())
    results = chain.invoke(input)

    pprint(results)
