from langchain_core.runnables import Runnable, RunnableSequence
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai.chat_models import ChatOpenAI
from pydantic import SecretStr

def create_extraction_chain[InputType, OutputType](
    api_key: SecretStr, 
    prompt: ChatPromptTemplate, 
    input_type: type[InputType],
    output_type: type[OutputType]
) -> Runnable[InputType, OutputType]:
    model = ChatOpenAI(model='gpt-4o', api_key=api_key)

    return RunnableSequence(
        prompt,
            model.with_structured_output(
            schema=output_type,
            method="json_schema",
            strict=True
        )
    ).with_types(input_type=input_type, output_type=output_type)
