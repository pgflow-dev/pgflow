import os
from datetime import datetime
from json import dumps as as_json

from .chain import InputType, create_chain


def worker(share):
    api_key = os.environ["OPENAI_API_KEY"]
    chain = create_chain(api_key=api_key).with_config({'run_name': 'Extract Entities'})

    # call llm
    input = InputType(input=as_json(share), time=datetime.now())
    infer_results = chain.invoke(input)

    return infer_results

