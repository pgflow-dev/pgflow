from feed_processor.models import Bookmark, JobContext
from pgqueuer.models import Job

from .chain import create_chain
from .schema import JobPayload, RunnableInput, RunnableOutput

OUTPUT_TYPES = dict(
    bookmark=Bookmark
)

def _find_row(job_payload: JobPayload, context: JobContext):
    print(f"JOB PAYLOAD = {job_payload}")

    results = (
        context
        .supabase
        .schema(job_payload.schema_name)
        .table(job_payload.table_name)
        .select('id, owner_id, content, created_at')
        .eq('id', job_payload.id)
        .single()
        .execute()
    )

    return results.data

def _create_row(record: dict, inference: Bookmark, job_payload: JobPayload, context: JobContext):
    print(f"_create_row:RECORD = {record}")
    print(f"_create_row:INFERENCE = {inference}")

    row_to_insert = inference.model_dump()
    row_to_insert['share_id'] = record['id']
    row_to_insert['owner_id'] = record['owner_id']
    results = (
        context
        .supabase
        .schema(job_payload.schema_name)
        .table('bookmarks')
        .insert(row_to_insert)
        .execute()
    )

    return results.data

async def extract_entity_by_type(job: Job, context: JobContext):
    job_payload = JobPayload.from_job(job)
    chain = create_chain(
        context=context,
        runnable_input_type=RunnableInput,
        type_to_extract=OUTPUT_TYPES[job_payload.entity_type]
    )
    record = _find_row(job_payload, context)

    print(f"RECORD = {record}")

    input = RunnableInput(
        input=record['content'],
        entity_type=job_payload.entity_type,
        entity_type_code='',
        extraction_rules="",
        time=str(record['created_at'])
    )
    inference = chain.invoke(input=input)
    print(f"INFERENCE = {inference}")

    rows = [_create_row(record=record, inference=bookmark, job_payload=job_payload, context=context)
            for bookmark in inference.entities]
    print(f"ROW = {rows}")
