import os
from json import dumps as as_json

from feed_processor.models import JobPayload
from supabase.client import Client as SupabaseClient

from .chain import InputType, create_chain


def worker(job_payload: JobPayload, supabase: SupabaseClient):
    api_key = os.environ["OPENAI_API_KEY"]

    chain = create_chain(api_key=api_key).with_config({'run_name': 'Infer Type'})

    # find record
    table = supabase.schema(job_payload.schema_name).table(job_payload.table_name)
    select_results = table.select("content").eq("id", job_payload.id).execute()
    print(select_results)

    # call llm
    input = InputType(input=as_json(select_results.data))
    infer_results = chain.invoke(input)
    print(infer_results)

    # update type
    update_results = (
        supabase
            .schema(job_payload.schema_name)
            .table(job_payload.table_name)
            .update(dict(inferred_type=infer_results.type))
            .eq("id", job_payload.id)
            .execute()
    )
    print(update_results)

    return infer_results
