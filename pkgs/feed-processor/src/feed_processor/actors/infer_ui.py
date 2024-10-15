import os
from datetime import datetime
from json import dumps as as_json
from json import loads as parse_json

from feed_processor.chains.infer_ui_chain import InputType, create_chain
from feed_processor.models import AttributesSchemaByType
from feed_processor.supabase import create_service_role_client
from pgqueuer.models import Job
from pgqueuer.queries import Queries
from pydantic import BaseModel
from supabase.client import Client as SupabaseClient


class RecordToRefresh(BaseModel):
    schema_name: str
    table_name: str
    id: str
    inferred_type: str

    @classmethod
    def from_job(cls, job: Job):
        assert job.payload, "No payload in job"

        return cls(**parse_json(job.payload.decode()))

async def infer_ui(job: Job, queries: Queries, supabase: SupabaseClient):
    record = RecordToRefresh.from_job(job)
    inference_results = run_inference(record, supabase)
    print(inference_results)

    update_results = (
        supabase
            .schema(record.schema_name)
            .table(record.table_name)
            .update(dict(inferred=dict(ui=inference_results.model_dump(), keywords=[])))
            .eq("id", record.id)
            .execute()
    )
    print(update_results)

def run_inference(record: RecordToRefresh, supabase: SupabaseClient):
    print(record)
    ui_schema = AttributesSchemaByType[record.inferred_type]
    infer_ui_chain = create_chain(api_key=os.environ["OPENAI_API_KEY"], schema=ui_schema).with_config({'run_name': 'Infer UI'})

    table = supabase.schema(record.schema_name).table(record.table_name)
    select_results = table.select("content, inferred_type").eq("id", record.id).single().execute()
    print(select_results)

    row = select_results.data
    print("----------------------------- ROW ---------------------------")
    print(row)

    input = InputType(
        input=row['content'],
        type=row['inferred_type'],
        datetime=datetime.now()
    )

    return infer_ui_chain.invoke(input)

################################
if __name__ == '__main__':
    import os

    from dotenv import load_dotenv
    from rich.pretty import pprint
    load_dotenv()

    from uuid import uuid4

    from feed_processor.supabase import create_service_role_client


    supabase = create_service_role_client()

    links = [
        '[Hacker News](https://news.ycombinator.com/)',
        '[Wikipedia](https://wikipedia.org/)',
        '[Google](https://google.com/)',
        '[Facebook](https://facebook.com/)',
        '[Twitter](https://twitter.com/)',
        '[Reddit](https://reddit.com/)',
    ]
    responses = [
        supabase.schema('feed').table('shares').insert(
            dict(
                id=str(uuid4()),
                owner_id='11111111-1111-1111-1111-111111111111',
                content=link
            )
        ).execute()
        for link in links
    ]
    pprint(responses)
