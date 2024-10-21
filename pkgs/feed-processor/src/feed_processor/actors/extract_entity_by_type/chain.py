from langchain_core.runnables import Runnable, RunnableSequence
from langchain_openai.chat_models import ChatOpenAI
from pydantic import SecretStr

from .prompt import prompt
from .schema import RunnableInput, RunnableOutput


def create_chain(api_key: SecretStr) -> Runnable[RunnableInput, RunnableOutput]:
    model = ChatOpenAI(model='gpt-4o', api_key=api_key)

    return RunnableSequence(
        prompt,
            model.with_structured_output(
            schema=RunnableOutput,
            method="json_schema",
            strict=True
        )
    ).with_types(input_type=RunnableInput, output_type=RunnableOutput)
