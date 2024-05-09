from langserve import RemoteRunnable
from rich.pretty import pprint

if __name__ == '__main__':
    chain = RemoteRunnable(
        'http://localhost:8081/edulaw-qa'
    )

    async def run():
        payload = dict(
            input="jak pomóc uczniowi w przypadku znęcania się?",
            messages=[]
        )
        events = chain.astream_events(payload, version='v1')

        async for event in events:
            pprint(event)
            # if event['event'] == 'on_chat_model_stream':
            #     data = event['data']
            #
            #     if event['data'] and 'chunk' in event['data'].keys():
            #         print(event['data']['chunk'].content, end='')

    import asyncio
    asyncio.run(run());
