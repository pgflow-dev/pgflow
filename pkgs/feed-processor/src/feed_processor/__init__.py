from __future__ import annotations

from feed_processor.actors.infer_type import infer_type
from feed_processor.actors.infer_ui import infer_ui
from feed_processor.supabase import create_service_role_client
from feed_processor.utils import get_connection
from pgqueuer.db import AsyncpgDriver
from pgqueuer.models import Job
from pgqueuer.qm import QueueManager
from pgqueuer.queries import Queries


async def main() -> QueueManager:
    connection = await get_connection()
    driver = AsyncpgDriver(connection)
    qm = QueueManager(driver)
    queries = Queries(driver)

    supabase = create_service_role_client()

    @qm.entrypoint('infer_type')
    async def infer_type_entrypoint(job: Job):
        await infer_type(job, queries, supabase)

    @qm.entrypoint('infer_ui')
    async def infer_ui_entrypoint(job: Job):
        await infer_ui(job, queries, supabase)

    return qm
