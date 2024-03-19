import os

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from openai import OpenAI
from rich.pretty import pprint

router = APIRouter(prefix='/proxy')

_CLIENTS = {}

def _get_client_for(provider: str) -> OpenAI:
    if provider == 'openai':
        if 'openai' not in _CLIENTS:
            _CLIENTS['openai'] = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))
        return _CLIENTS['openai']
    else:
        raise NotImplementedError

def _create_event_generator(_openai_client: OpenAI, **kwargs):
    stream = _openai_client.chat.completions.create(**kwargs)
    try:
        for event in stream:
            if event.choices[0].delta.content:
                yield f"data: {event.json()}\n\n"
    except Exception as e:
        pprint(e)
        stream.cancel()

@router.post('/{provider}/chat/completions')
async def chat_completions(request: Request, provider: str):
    client = _get_client_for(provider=provider)
    data = await request.json()

    if 'stream' in data and data['stream']:
        return StreamingResponse(_create_event_generator(**data, _openai_client=client), media_type='text/event-stream')
    else:
        response = client.chat.completions.create(**data)
        return response

