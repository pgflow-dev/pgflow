import { describe, expect, it } from 'vitest';
import worker, { type Env } from './index';

function makeEnv() {
  const points: Array<{ indexes: string[]; blobs: string[]; doubles: number[] }> = [];
  const env = {
    PGFLOW_TELEMETRY: {
      writeDataPoint: (p: { indexes: string[]; blobs: string[]; doubles: number[] }) =>
        points.push(p),
    },
  } as unknown as Env;
  return { env, points };
}

function post(body: unknown, env: Env, raw = false): Promise<Response> {
  return worker.fetch(
    new Request('https://pgflow-telemetry.workers.dev/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    env,
  );
}

const valid = {
  schema: 1,
  contributions: [
    { metric: 'runs_started_day', bucket: '2-3' },
    { metric: 'workers_by_version', bucket: '0.17.0', count: '1' },
    { metric: 'uses_map', bucket: 'yes' },
  ],
};

describe('telemetry ingest', () => {
  it('accepts a valid payload, writes one point per contribution, returns 204', async () => {
    const { env, points } = makeEnv();
    const res = await post(valid, env);
    expect(res.status).toBe(204);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({
      indexes: ['runs_started_day'],
      blobs: ['2-3'],
      doubles: [1],
    });
  });

  it('rejects GET with 405', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      new Request('https://pgflow-telemetry.workers.dev/', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(405);
  });

  it('rejects malformed JSON with 400', async () => {
    const { env } = makeEnv();
    const res = await post('{not json', env, true);
    expect(res.status).toBe(400);
  });

  it('rejects wrong schema version with 400', async () => {
    const { env, points } = makeEnv();
    const res = await post({ schema: 2, contributions: valid.contributions }, env);
    expect(res.status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('rejects unknown metric with 400', async () => {
    const { env } = makeEnv();
    const res = await post({
      schema: 1,
      contributions: [{ metric: 'flow_slug', bucket: 'yes' }],
    }, env);
    expect(res.status).toBe(400);
  });

  it('rejects arbitrary bucket strings with 400', async () => {
    const { env } = makeEnv();
    const res = await post({
      schema: 1,
      contributions: [{ metric: 'runs_started_day', bucket: 'banana' }],
    }, env);
    expect(res.status).toBe(400);
  });

  it('rejects non-semantic-version buckets with 400', async () => {
    const { env } = makeEnv();
    const res = await post({
      schema: 1,
      contributions: [{ metric: 'workers_by_version', bucket: 'my-flow-name' }],
    }, env);
    expect(res.status).toBe(400);
  });

  it('rejects oversized bodies with 413', async () => {
    const { env } = makeEnv();
    const big = 'x'.repeat(2049);
    const res = await post(big, env, true);
    expect(res.status).toBe(413);
  });

  it('rejects more than 64 contributions', async () => {
    const { env, points } = makeEnv();
    const res = await post({
      schema: 1,
      contributions: Array.from({ length: 65 }, () => ({
        metric: 'uses_map',
        bucket: 'yes',
      })),
    }, env);
    // 65 valid contributions always exceed the 2 KB body cap, so the size
    // guard (413) fires before the count guard. MAX_CONTRIBUTIONS stays as
    // defense-in-depth below the byte cap.
    expect(res.status).toBe(413);
    expect(points).toHaveLength(0);
  });

  it('sets no cookies on success', async () => {
    const { env } = makeEnv();
    const res = await post(valid, env);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
