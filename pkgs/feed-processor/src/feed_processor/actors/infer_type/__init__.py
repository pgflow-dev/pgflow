from feed_processor.models import JobContext, JobPayload
from pgqueuer.models import Job

from .worker import worker


async def infer_type(job: Job, context: JobContext):
    job_payload = JobPayload.from_job(job)
    results = worker(job_payload, context.supabase)

    # await queries.enqueue(
    #     entrypoint="infer_ui",
    #     payload=as_json(dict(
    #         schema_name=job_payload.schema_name,
    #         table_name=job_payload.table_name,
    #         id=job_payload.id,
    #         inferred_type=results.type
    #     )).encode(),
    # )
