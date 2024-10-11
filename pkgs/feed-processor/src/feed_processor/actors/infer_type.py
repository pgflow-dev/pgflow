import os
from json import dumps as as_json
from json import loads as parse_json

from feed_processor.chains.infer_type_chain import InputType, create_chain
from feed_processor.supabase import create_service_role_client
from pgqueuer.models import Job
from pgqueuer.queries import Queries
from pydantic import BaseModel
from supabase.client import Client as SupabaseClient


class RecordToRefresh(BaseModel):
    schema_name: str
    table_name: str
    id: str

    @classmethod
    def from_job(cls, job: Job):
        assert job.payload, "No payload in job"

        return cls(**parse_json(job.payload.decode()))

async def infer_type(job: Job, queries: Queries, _: SupabaseClient):
    if not job.payload:
        return

    record = RecordToRefresh.from_job(job)
    results = refresh_record_type(record)

    await queries.enqueue(
        entrypoint="infer_ui",
        payload=as_json(dict(
            schema_name=record.schema_name,
            table_name=record.table_name,
            id=record.id,
            inferred_type=results.type
        )).encode(),
    )

def refresh_record_type(record: RecordToRefresh):
    print(record)
    supabase = create_service_role_client()
    infer_type_chain = create_chain(api_key=os.environ["OPENAI_API_KEY"])

    # find record
    table = supabase.schema(record.schema_name).table(record.table_name)
    select_results = table.select("json_content").eq("id", record.id).execute()
    print(select_results)

    # call llm
    input = InputType(input=as_json(select_results.data))
    infer_results = infer_type_chain.invoke(input)
    print(infer_results)

    # update type
    if infer_results.confidence > 0.7:
        update_results = (
            supabase
                .schema(record.schema_name)
                .table(record.table_name)
                .update(dict(inferred_type=infer_results.type))
                .eq("id", record.id)
                .execute()
        )
        print(update_results)

    return infer_results

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
                json_content=dict(
                    input=link
                )
            )
        ).execute()
        for link in links
    ]
    pprint(responses)
