from __future__ import annotations

import os
from typing import List

import asyncpg
from asyncpg.pool import Pool
from feed_processor.models import JobContext
from feed_processor.spikes.pgflow import setup_pgflow_entrypoints
from feed_processor.supabase import create_service_role_client
from feed_processor.tasks.extract_entity_by_type import extract_entity_by_type
from feed_processor.tasks.transcribe_recording import transcribe_recording
from pgqueuer.db import AsyncpgDriver, AsyncpgPoolDriver
from pgqueuer.models import Job
from pgqueuer.qm import QueueManager
from pgqueuer.queries import Queries
from pydantic import SecretStr

DATABASE_URL = os.environ.get("DATABASE_URL")

async def fetch_entrypoints(pool: Pool) -> List[str]:
    """Fetch flow step entrypoints from the database.

    Returns array of strings in format: 'flow_slug/step_slug'
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT flow_slug || '/' || step_slug FROM pgflow.steps")
        return [row[0] for row in rows]


async def main() -> QueueManager:
    print('Setting up QueueManager...')
    # Create connection for the queue manager driver
    connection = await asyncpg.connect(DATABASE_URL)
    driver = AsyncpgDriver(connection)

    # Create separate connection pool for job queries
    pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=5,
        max_size=10,
        max_queries=50000,
        max_inactive_connection_lifetime=300.0
    )

    if not pool:
        raise Exception("Cannot create connection... exiting")

    pool_driver = AsyncpgPoolDriver(pool)
    qm = QueueManager(pool_driver)

    if not pool:
        raise Exception("Cannot create pool... exiting")

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

    @qm.entrypoint("extract_entity_by_type")
    async def extract_entity_by_type_entrypoint(job: Job):
        print("-------------- extract_entity_by_type --------------")
        await extract_entity_by_type(job, context)

    @qm.entrypoint('transcribe_recording')
    async def transcribe_recording_entrypoint(job: Job):
        print("-------------- transcribe_recording --------------")
        await transcribe_recording(job, context)

    entrypoints = await fetch_entrypoints(pool)
    setup_pgflow_entrypoints(entrypoints, qm, context)

    print('Starting QueueManager...')
    print('Handling following entrypoints:')

    for entrypoint in qm.entrypoint_registry.keys():
        print(f"  - {entrypoint}")

    return qm
