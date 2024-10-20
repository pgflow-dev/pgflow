from feed_processor.models import JobContext, JobPayload as BaseJobPayload, Bookmark
from feed_processor.utils import create_extraction_chain
from pgqueuer.models import Job
from typing import Literal
from pydantic import BaseModel

from .prompt import prompt


OUTPUT_TYPES = dict(
    bookmark=Bookmark
)

class ExtractionChainInput(BaseModel):
    input: str
    output_type: type[BaseModel]
    extraction_rules: str
    time: str

class JobPayload(BaseJobPayload):
    entity_type: Literal["bookmark"]

def _find_row(job_payload: JobPayload, context: JobContext):
    return (
        context
        .supabase
        .schema(job_payload.schema_name).
        table(job_payload.table_name).
        select('content').
        eq('id', job_payload.id).
        single()
    )

def extract_entity_by_type(job: Job, context: JobContext):
    job_payload = JobPayload.from_job(job)
    chain = create_extraction_chain(
        api_key=context.openai_api_key,
        prompt=prompt,
        input_type=ExtractionChainInput,
        output_type=OUTPUT_TYPES[job_payload.entity_type]
    )
    record = _find_row(job_payload, context)
    input = ExtractionChainInput(
        input=record.content,     
        output_type=OUTPUT_TYPES[job_payload.entity_type],
    )
    entity = chain.invoke(dict(input=))


