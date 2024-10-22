from typing import Type, TypeVar

from feed_processor.models import JobContext
from langchain_core.runnables import Runnable, RunnableSequence
from langchain_groq.chat_models import ChatGroq
from langchain_openai.chat_models import ChatOpenAI
from pydantic import BaseModel

from .prompt import prompt
from .schema import RunnableInput, RunnableOutput

_InputT = TypeVar('_InputT', bound=RunnableInput)
_OutputT = TypeVar('_OutputT', bound=RunnableOutput)

def create_chain(context: JobContext, input_type: Type[_InputT], output_type: Type[_OutputT]) -> Runnable[_InputT, _OutputT]:
    model = ChatOpenAI(model='gpt-4o-mini', api_key=context.openai_api_key)

    # groq_model = "llama3-groq-70b-8192-tool-use-preview"
    # groq_model = "llama3-groq-8b-8192-tool-use-preview"
    # groq_model = "mixtral-8x7b-32768"
    # groq_model = "gemma2-9b-it"
    # model = ChatGroq(model=groq_model, api_key=context.groq_api_key, stop_sequences=[])

    return RunnableSequence(
        prompt,
            model.with_structured_output(
            schema=output_type,

            # openai
            method="json_schema",
            strict=True

            # groq
            # method="function_calling",
        )
    ).with_types(input_type=input_type, output_type=output_type)
