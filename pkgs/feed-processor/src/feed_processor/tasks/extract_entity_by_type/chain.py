from typing import Generic, List, Type, TypeVar

from feed_processor.models import JobContext
from langchain_anthropic.chat_models import ChatAnthropic
from langchain_core.runnables import Runnable, RunnableSequence
from langchain_groq.chat_models import ChatGroq
from langchain_openai.chat_models import ChatOpenAI
from pydantic import BaseModel, create_model

from .prompt import prompt

_RunnableInputT = TypeVar('_RunnableInputT')
_EntityT = TypeVar('_EntityT', bound=BaseModel)


class ExtractedEntities(BaseModel, Generic[_EntityT]):
    entities: List[_EntityT]

def _create_output_type(entity_type: Type[_EntityT]):
    return create_model(
        f"Extracted{entity_type.__name__}s",
        __base__=ExtractedEntities[entity_type],
    )

def create_chain(context: JobContext, runnable_input_type: Type[_RunnableInputT], type_to_extract: Type[_EntityT]) -> Runnable[_RunnableInputT, ExtractedEntities[_EntityT]]:
    output_type = _create_output_type(entity_type=type_to_extract)

    ### OpenAI
    # openai_model = 'gpt-4o'
    openai_model = 'gpt-4o-mini'
    model = ChatOpenAI(model=openai_model, api_key=context.openai_api_key).with_structured_output(
        schema=output_type,
        method="json_schema",
        strict=True
    )

    # ### Anthropic
    # # claude_model = "claude-3-haiku-20240307"
    # claude_model = "claude-3-opus-20240229"
    # # claude_model = "claude-3-5-sonnet-20241022"
    # model = ChatAnthropic(model=claude_model, api_key=context.anthropic_api_key).with_structured_output(
    #     schema=output_type,
    #     method="json_schema",
    #     strict=True
    # )

    # ### Groq
    # # groq_model = "llama3-groq-70b-8192-tool-use-preview"
    # # groq_model = "llama3-groq-8b-8192-tool-use-preview"
    # groq_model = "mixtral-8x7b-32768"
    # # groq_model = "gemma2-9b-it"
    # model = ChatGroq(model=groq_model, api_key=context.groq_api_key, stop_sequences=[]).with_structured_output(
    #     schema=output_type,
    #     method="function_calling"
    # )

    return RunnableSequence(prompt, model).with_types(
        input_type=runnable_input_type,
        output_type=output_type
    )
