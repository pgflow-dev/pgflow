import asyncio
from json import dumps as to_json
from json import loads as parse_json
from random import gauss
from uuid import UUID

from feed_processor.models import JobContext
from pgqueuer.models import Job
from pgqueuer.qm import QueueManager


def gen_long_sleep_time():
    return min(3.0, abs(gauss(1.5, 0.6) + gauss(0.3, 0.2)) * 0.8)

def gen_short_sleep_time():
    return 0.3;
    # return min(0.1, max(0.1, abs(gauss(0.2, 0.05))))

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
                run_id = UUID(run['run_id'])
                step_slug = payload['__step__']['step_slug']
                step_result = dict(step_slug=step_slug)

                # query = "SELECT pgflow.run_flow($1::text, $2::jsonb)"
                query = """
                SELECT pgflow.complete_step($1::UUID, $2::text, $3::jsonb);
                """

                # Debug the input parameters
                print(f"Executing complete_step with:")
                print(f"- run_id: {run_id}")
                print(f"- step_result: {step_result}")

                pool = context.driver
                await asyncio.sleep(gen_short_sleep_time())

                results = await pool.fetch(query, run_id, step_slug, to_json(step_result))
                print('RESULTS')
                print(results)
