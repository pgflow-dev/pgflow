from operator import itemgetter
from typing import List, Union

from app.utils import init_supabase_vectorstore
from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from langchain_openai.chat_models import ChatOpenAI
from langchain_openai.embeddings import OpenAIEmbeddings
from prompts.chat_with_history_and_context_prompt import \
    prompt as chat_with_history_and_context_prompt
from prompts.standalone_question_prompt import \
    prompt as standalone_question_prompt
from pydantic import BaseModel, Field


def format_docs(docs):
	return "\n\n".join([d.page_content for d in docs])

class InputType(BaseModel):
    input: str
    messages: List[Union[HumanMessage, AIMessage, SystemMessage]] = Field(
        ...,
        description="Chat messages representing current conversation"
    )

def debug(label):
    from rich.pretty import pprint

    def debug_fn(original_input):
        pprint(f"{label}: {original_input}")
        return original_input

    return RunnableLambda(debug_fn)

def create_chain():
    load_dotenv()

    model = ChatOpenAI(model="gpt-3.5-turbo")
    vectorstore = init_supabase_vectorstore(
	embedding=OpenAIEmbeddings(),
	query_name='match_documents_via_embeddings'
    )
    retriever = vectorstore.as_retriever(
	search_type="similarity",
	search_kwargs=dict(k=5),
    )
    standalone_question_chain = standalone_question_prompt | model

    chain = (
        debug('start')
        | RunnablePassthrough.assign(
            input=standalone_question_chain.with_config(run_name="standalone_question"),
            original_input=itemgetter("input"),
        )
        | debug('after standalone')
        | RunnablePassthrough.assign(
            context=itemgetter("input") | StrOutputParser() | retriever.with_config(run_name='retriever') | format_docs,
        ).with_config(run_name="context")
        | debug('after context')
        | chat_with_history_and_context_prompt.with_config(run_name="chat_with_history_and_context")
        | debug('after prompt')
        | model.with_config(run_name="final_stream")
    )

    return chain.with_types(input_type=InputType)

if __name__ == "__main__":
    from rich.pretty import pprint

    async def run():
        chain = create_chain()

        question = "jakiego wsparcia szkoła może udzielić uczniowi z zespołem aspergera?"
        pprint(question)

        events = chain.astream_events(dict(input=question, messages=[]), version='v1')

        async for event in events:
            pprint(event)

    import asyncio
    asyncio.run(run());
