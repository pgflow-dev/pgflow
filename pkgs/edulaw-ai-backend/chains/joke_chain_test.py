from langserve import RemoteRunnable
from rich.pretty import pprint

if __name__ == '__main__':
    chain = RemoteRunnable(
        'http://localhost:8081/joke'
    )

    async def run():
        events = chain.astream_events(dict(input="programming"), version='v1')

        async for event in events:
            pprint(event)
            # if event['event'] == 'on_chat_model_stream':
            #     data = event['data']
            #
            #     if event['data'] and 'chunk' in event['data'].keys():
            #         print(event['data']['chunk'].content, end='')

    import asyncio
    asyncio.run(run());
