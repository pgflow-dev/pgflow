import os
from json import dumps as as_json

from feed_processor.models import JobPayload
from supabase.client import Client as SupabaseClient

from .chain import InputType, create_chain


def worker(share, supabase: SupabaseClient):
    api_key = os.environ["OPENAI_API_KEY"]
    chain = create_chain(api_key=api_key).with_config({'run_name': 'Extract Entities'})

    # call llm
    input = InputType(input=as_json(share))
    infer_results = chain.invoke(input)

    return infer_results

