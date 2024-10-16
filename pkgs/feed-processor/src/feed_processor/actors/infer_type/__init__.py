from json import dumps as as_json

from feed_processor.models import JobPayload
from pgqueuer.models import Job
from pgqueuer.queries import Queries
from supabase.client import Client as SupabaseClient

from .worker import worker


async def infer_type(job: Job, queries: Queries, supabase: SupabaseClient):
    job_payload = JobPayload.from_job(job)
    results = worker(job_payload, supabase)

    # await queries.enqueue(
    #     entrypoint="infer_ui",
    #     payload=as_json(dict(
    #         schema_name=job_payload.schema_name,
    #         table_name=job_payload.table_name,
    #         id=job_payload.id,
    #         inferred_type=results.type
    #     )).encode(),
    # )
