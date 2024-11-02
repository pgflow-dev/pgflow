import asyncio
from json import dumps as to_json
from json import loads as parse_json
from random import uniform
from uuid import UUID

from feed_processor.models import JobContext
from pgqueuer.models import Job
from pgqueuer.qm import QueueManager


async def _pgflow_handler(job: Job):
    print(f"===> {job.entrypoint}")
    print(f"     {job.payload and job.payload.decode()}")

def setup_pgflow_entrypoints(entrypoints: list[str], qm: QueueManager, context: JobContext):
    for entrypoint in entrypoints:
        @qm.entrypoint(name=entrypoint)
        async def flow_01_root(job: Job):
            await _pgflow_handler(job);

            if job.payload:
                print('got payload')
                payload = parse_json(job.payload.decode())
                print('\n'.join(f'{k}: {v}' for k, v in payload.items()))
                run = payload['__run__']
                run_id = UUID(run['id'])
                step_slug = payload['__step__']['slug']
                step_result = dict(step_slug=step_slug)

                # query = "SELECT pgflow.run_workflow($1::text, $2::jsonb)"
                query = """
                SELECT pgflow.complete_step($1::UUID, $2::text, $3::jsonb);
                """

                # Debug the input parameters
                print(f"Executing complete_step with:")
                print(f"- run_id: {run_id}")
                print(f"- step_result: {step_result}")

                pool = context.pool
                await asyncio.sleep(uniform(1, 3))
                async with pool.acquire() as connection:
                    async with connection.transaction():
                        results = await connection.fetch(query, run_id, step_slug, to_json(step_result))
                        print('RESULTS')
                        print(results)
