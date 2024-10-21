from feed_processor.models import JobContext
from langchain_core.runnables import Runnable, RunnableSequence
from langchain_groq.chat_models import ChatGroq
from langchain_openai.chat_models import ChatOpenAI
from pydantic import SecretStr

from .prompt import prompt
from .schema import RunnableInput, RunnableOutput


def create_chain(context: JobContext) -> Runnable[RunnableInput, RunnableOutput]:
    # model = ChatOpenAI(model='gpt-4o', api_key=api_key)
    model = ChatGroq(model='gemma2-9b-it', api_key=context.groq_api_key, stop_sequences=[])

    return RunnableSequence(
        prompt,
            model.with_structured_output(
            schema=RunnableOutput,
            method="function_calling",
            # strict=True
        )
    ).with_types(input_type=RunnableInput, output_type=RunnableOutput)
