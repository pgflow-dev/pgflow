from datetime import datetime
from typing import Literal, Type, TypedDict, TypeVar, Union

from feed_processor.models import Bookmark, Event, UiProps
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable, RunnableSequence
from langchain_openai.chat_models import ChatOpenAI
from pydantic import BaseModel, Field, SecretStr

SYSTEM_PROMPT = """
You are expert metadata extractor.
Your job is to get free form or structured text representing
a record of type "{type}" and extract required metadata to show its UI.

You must be precise and factual and not skip any details.
Output only valid JSON.

Here are additional informations that you can use in your guesses:
current_datetime = "{datetime}"
"""

class InputType(TypedDict):
    input: str
    datetime: datetime
    type: Union[Literal["event"], Literal["video"], Literal["snippet"], Literal["bookmark"], Literal["text"]]

prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("user", "{input}")
])

SchemaT = TypeVar('SchemaT', bound=BaseModel)

def create_chain(api_key: str, schema: Type[SchemaT]) -> Runnable[InputType, SchemaT]:
    model = ChatOpenAI(model='gpt-4o-mini', api_key=SecretStr(api_key))

    return RunnableSequence(
        prompt,
        model.with_structured_output(
            schema=schema,
            method="json_schema",
            strict=True
        )
    ).with_types(input_type=InputType, output_type=schema)

################################
if __name__ == '__main__':
    import os

    from dotenv import load_dotenv
    from rich.pretty import pprint
    load_dotenv()

    chain = create_chain(api_key=os.environ["OPENAI_API_KEY"], schema=Event)
    input = InputType(
        input="dentist tommorrow",
        type="bookmark",
        datetime=datetime.now()
    )
    results = chain.invoke(input)

    pprint(results)
