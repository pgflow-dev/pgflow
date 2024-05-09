from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai.chat_models import ChatOpenAI

chain = (
    ChatPromptTemplate.from_template("Tell me a joke about {input}")
    | ChatOpenAI(model="gpt-3.5-turbo-1106")
    | StrOutputParser()
)

if __name__ == "__main__":
    async def run():
        events = chain.astream_events(dict(input="programming"), version='v1')

        async for event in events:
            print(event)

    import asyncio
    asyncio.run(run());
