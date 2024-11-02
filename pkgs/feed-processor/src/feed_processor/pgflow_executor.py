from datetime import timedelta
from json import loads as parse_json

from feed_processor.models import JobPayload
from pgqueuer.models import Job
from pgqueuer.qm import JobExecutor


class Pgflow(JobExecutor):
    def __init__(
        self,
        func,
        requests_per_second: float = 2.0,
        retry_timer: timedelta = timedelta(seconds=30),
        serialized_dispatch: bool = True,
    ):
        super().__init__(func, requests_per_second, retry_timer, serialized_dispatch)

    async def execute(self, job: Job) -> None:
        workflow_slug, step_slug = job.entrypoint.split("/")

        if job.payload:
            payload_json = parse_json(job.payload.decode())
        else:
            payload_json = {}

        # await self.func()
