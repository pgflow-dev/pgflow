from typing import List, Literal, TypedDict, Union

from feed_processor.models import UiProps
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import (Runnable, RunnableSequence,
                                      RunnableSerializable)
from langchain_openai.chat_models import ChatOpenAI
from pydantic import BaseModel, Field, SecretStr


class MyInput(TypedDict):
    title: str
    keywords: List[str]

class MyOutput(BaseModel):
    sentiment: Union[Literal["positive"], Literal["neutral"], Literal["negative"]]

SYSTEM_PROMPT = """
You are expert in extracting sentiment from text.
Your job is to get free form or structured text representing
an arbitrary content saved by user.

You must truthfully extract sentiment from text and output as valid JSON.
"""

prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("user", "Title: {title}, keywords: {keywords}"),
])

def create_chain(api_key: str) -> Runnable[MyInput, MyOutput]:
    model = ChatOpenAI(model='gpt-4o-mini', api_key=SecretStr(api_key))

    return RunnableSequence(
            prompt, 
            model.with_structured_output(
                schema=MyOutput,
                method="json_schema",
                strict=True
            )
    ).with_types(input_type=MyInput, output_type=MyOutput)

################################
if __name__ == '__main__':
    import os

    from dotenv import load_dotenv
    from rich.pretty import pprint
    load_dotenv()

    chain = create_chain(api_key=os.environ["OPENAI_API_KEY"])

    input = MyInput(title="Google", keywords=["Google", "news"])
    results = chain.invoke(input)

    pprint(results)
