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

print(f"OPENAI_API_KEY={os.environ['OPENAI_API_KEY']}")
print(f"GROQ_API_KEY={os.environ['GROQ_API_KEY']}")
print(f"ANTHROPIC_API_KEY={os.environ['ANTHROPIC_API_KEY']}")
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
        print(f"-------------- job = {job}")
        print("---------------------------------------------------")
        await extract_entity_by_type(job, context)

    return qm
