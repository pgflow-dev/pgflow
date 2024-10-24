from __future__ import annotations

import os

import asyncpg
from feed_processor.models import JobContext
from feed_processor.supabase import create_service_role_client
from feed_processor.tasks.extract_entity_by_type import extract_entity_by_type
from pgqueuer.db import AsyncpgDriver
from pgqueuer.models import Job
from pgqueuer.qm import QueueManager
from pgqueuer.queries import Queries
from pydantic import SecretStr

DATABASE_URL = os.environ.get("DATABASE_URL")

async def main() -> QueueManager:
    print('Setting up QueueManager...')
    connection = await asyncpg.connect(DATABASE_URL)
    driver = AsyncpgDriver(connection)
    qm = QueueManager(driver)

    context = JobContext(
        supabase=create_service_role_client(),
        connection=connection,
        driver=driver,
        qm=qm,
        queries=Queries(driver),
        openai_api_key=SecretStr(os.environ["OPENAI_API_KEY"]),
        groq_api_key=SecretStr(os.environ["GROQ_API_KEY"]),
        anthropic_api_key=SecretStr(os.environ["ANTHROPIC_API_KEY"])
    )

    @qm.entrypoint(f"extract_entity_by_type", concurrency_limit=16, requests_per_second=128)
    async def extract_entity_by_type_entrypoint(job: Job):
        print("-------------- extract_entity_by_type --------------")
        await extract_entity_by_type(job, context)

    print('Starting QueueManager...')
    return qm
