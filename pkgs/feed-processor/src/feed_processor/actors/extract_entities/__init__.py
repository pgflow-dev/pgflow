from json import dumps as as_json

from feed_processor.models import JobPayload
from pgqueuer.models import Job
from pgqueuer.queries import Queries
from supabase.client import Client as SupabaseClient

from .worker import worker


async def extract_entities(job: Job, _: Queries, supabase: SupabaseClient):
    job_payload = JobPayload.from_job(job)

    # find record
    table = supabase.schema(job_payload.schema_name).table(job_payload.table_name)
    select_results = table.select("id, content, owner_id").eq("id", job_payload.id).single().execute()

    if select_results.data is None:
        raise Exception(f"Could not find record with id {job_payload.id} in {job_payload.schema_name}.{job_payload.table_name}")

    share = select_results.data
    # print('-------------------------- share')
    # print(share)
    results = worker(share)

    entities_to_save = {}

    for entity in results.entities:
        if entity.table_name not in entities_to_save:
            entities_to_save[entity.table_name] = []

        entity_dict = entity.to_supabase_dict()
        entity_dict['owner_id'] = share['owner_id']
        entity_dict['share_id'] = share['id']
        entities_to_save[entity.table_name].append(entity_dict)
    # print('---------------------------------- entities to save')

    for table_name, entities in entities_to_save.items():
        # print(f"Saving {table_name}...")

        results = (
            supabase
            .schema('feed')
            .table(table_name)
            .insert(entities)
            .execute()
        )
        # print(results)

