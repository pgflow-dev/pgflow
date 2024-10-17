from __future__ import annotations

import os

import asyncpg
from feed_processor.actors.extract_entities import extract_entities
from feed_processor.actors.infer_type import infer_type
from feed_processor.supabase import create_service_role_client
from pgqueuer.db import AsyncpgDriver
from pgqueuer.models import Job
from pgqueuer.qm import QueueManager
from pgqueuer.queries import Queries

print(f"LANGCHAIN_API_KEY={os.environ['LANGCHAIN_API_KEY']}")
print(f"LANGCHAIN_ENDPOINT={os.environ['LANGCHAIN_ENDPOINT']}")
print(f"LANGCHAIN_PROJECT={os.environ['LANGCHAIN_PROJECT']}")
print(f"LANGCHAIN_TRACING_V2={os.environ['LANGCHAIN_TRACING_V2']}")
print(f"DATABASE_URL={os.environ['DATABASE_URL']}")

DATABASE_URL = os.environ.get("DATABASE_URL")

async def main() -> QueueManager:
    connection = await asyncpg.connect(DATABASE_URL)
    driver = AsyncpgDriver(connection)
    qm = QueueManager(driver)
    queries = Queries(driver)

    supabase = create_service_role_client()

    @qm.entrypoint('infer_type')
    async def infer_type_entrypoint(job: Job):
        await infer_type(job, queries, supabase)

    @qm.entrypoint('extract_entities')
    async def extract_entities_entrypoint(job: Job):
        await extract_entities(job, queries, supabase)

    return qm
