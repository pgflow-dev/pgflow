from feed_processor.models import JobContext
from langchain_core.runnables import Runnable, RunnableSequence
from langchain_groq.chat_models import ChatGroq
from langchain_openai.chat_models import ChatOpenAI
from pydantic import SecretStr

from .prompt import prompt
from .schema import RunnableInput, RunnableOutput


def create_chain(context: JobContext) -> Runnable[RunnableInput, RunnableOutput]:
    # model = ChatOpenAI(model='gpt-4o-mini', api_key=context.openai_api_key)

    # llama3_70b_tool = "llama3-groq-70b-8192-tool-use-preview"
    llama3_8b_tool = "llama3-groq-8b-8192-tool-use-preview"
    # mixtral = "mixtral-8x7b-32768"
    # gemma2 = "gemma2-9b-it"
    model = ChatGroq(model=llama3_8b_tool, api_key=context.groq_api_key, stop_sequences=[])

    return RunnableSequence(
        prompt,
            model.with_structured_output(
            schema=RunnableOutput,

            # openai
            # method="json_schema",
            # strict=True

            # groq
            method="function_calling",
        )
    ).with_types(input_type=RunnableInput, output_type=RunnableOutput)
