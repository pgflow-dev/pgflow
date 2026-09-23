import { describe, expect, it } from 'vitest';
import worker, { type Env } from './index';
// Worst-case payload produced by pgflow_telemetry.preview() on the real
// SQL (65 runs with distinct millisecond durations + 70 worker versions):
// 31 bounded contributions, 2015 bytes. Regenerate from a local database
// whenever the sender schema changes.
import fixture from './sender-fixture.json';

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

function post(
  body: unknown,
  env: Env,
  raw = false,
  contentType = 'application/json',
): Promise<Response> {
  return worker.fetch(
    new Request('https://pgflow-telemetry.workers.dev/', {
      method: 'POST',
      headers: { 'content-type': contentType },
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
  });

  it.each([
    'cli_install_fresh',
    'cli_install_update',
    'cli_install_noop',
  ])('accepts the %s event with version and migration-count bucket', async (metric) => {
    const { env, points } = makeEnv();
    const res = await post({
      schema: 1,
      contributions: [{ metric, bucket: '0.18.0', count: '4-7' }],
    }, env);
    expect(res.status).toBe(204);
    expect(points).toEqual([{
      indexes: [metric],
      blobs: ['0.18.0', '4-7'],
      doubles: [1],
    }]);
  });

  it('stores the count bucket as a second blob', async () => {
    const { env, points } = makeEnv();
    await post(valid, env);
    expect(points[1]).toEqual({
      indexes: ['workers_by_version'],
      blobs: ['0.17.0', '1'],
      doubles: [1],
    });
  });

  it('writes a single blob for uncounted contributions', async () => {
    const { env, points } = makeEnv();
    await post(valid, env);
    expect(points[0]).toEqual({
      indexes: ['runs_started_day'],
      blobs: ['2-3'],
      doubles: [1],
    });
    expect(points[2].blobs).toEqual(['yes']);
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
    const { env, points } = makeEnv();
    const res = await post('{not json', env, true);
    expect(res.status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('rejects wrong schema version with 400', async () => {
    const { env, points } = makeEnv();
    const res = await post({ schema: 2, contributions: valid.contributions }, env);
    expect(res.status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('rejects null and array roots with 400', async () => {
    const { env, points } = makeEnv();
    expect((await post('null', env, true)).status).toBe(400);
    expect((await post('[1,2]', env, true)).status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('rejects unknown root keys with 400', async () => {
    const { env, points } = makeEnv();
    const res = await post(
      { schema: 1, contributions: valid.contributions, extra: 'x' },
      env,
    );
    expect(res.status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('rejects unknown contribution keys with 400', async () => {
    const { env, points } = makeEnv();
    const res = await post(
      {
        schema: 1,
        contributions: [{ metric: 'uses_map', bucket: 'yes', surprise: 1 }],
      },
      env,
    );
    expect(res.status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('rejects prototype-named metrics with 400', async () => {
    const { env, points } = makeEnv();
    for (const metric of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const res = await post(
        { schema: 1, contributions: [{ metric, bucket: 'yes' }] },
        env,
      );
      expect(res.status, `metric ${metric}`).toBe(400);
    }
    expect(points).toHaveLength(0);
  });

  it('rejects non-string metrics with 400', async () => {
    const { env, points } = makeEnv();
    const res = await post(
      { schema: 1, contributions: [{ metric: 42, bucket: 'yes' }] },
      env,
    );
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

  it('rejects non-bucket count values with 400', async () => {
    const { env, points } = makeEnv();
    const res = await post({
      schema: 1,
      contributions: [{ metric: 'workers_by_version', bucket: '0.17.0', count: 7 }],
    }, env);
    expect(res.status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('rejects duplicate metric/bucket pairs with 400 before any write', async () => {
    const { env, points } = makeEnv();
    const res = await post({
      schema: 1,
      contributions: [
        { metric: 'uses_map', bucket: 'yes' },
        { metric: 'uses_map', bucket: 'yes' },
        { metric: 'runs_started_day', bucket: '2-3' },
      ],
    }, env);
    expect(res.status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('rejects a repeated pair even when the counts differ', async () => {
    const { env, points } = makeEnv();
    const res = await post({
      schema: 1,
      contributions: [
        { metric: 'workers_by_version', bucket: '0.17.0', count: '1' },
        { metric: 'workers_by_version', bucket: '0.17.0', count: '2-3' },
      ],
    }, env);
    expect(res.status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('accepts application/json with charset parameters', async () => {
    const { env } = makeEnv();
    const res = await post(valid, env, false, 'application/json; charset=utf-8');
    expect(res.status).toBe(204);
  });

  it('rejects media types that merely mention application/json', async () => {
    const { env, points } = makeEnv();
    for (const contentType of [
      'text/plain; application/json',
      'application/jsonp',
      'text/application/json',
    ]) {
      const res = await post(valid, env, false, contentType);
      expect(res.status, contentType).toBe(415);
    }
    expect(points).toHaveLength(0);
  });

  it('rejects oversized bodies with 413', async () => {
    const { env } = makeEnv();
    const big = 'x'.repeat(2049);
    const res = await post(big, env, true);
    expect(res.status).toBe(413);
  });

  it('measures body bytes, not UTF-16 code units', async () => {
    const { env, points } = makeEnv();
    // 1100 two-byte characters: 2200+ UTF-8 bytes, ~1130 UTF-16 units.
    const multibyte = '{"schema":1,"contributions":[{"metric":"' +
      'é'.repeat(1100) + '","bucket":"yes"}]}';
    expect(multibyte.length).toBeLessThan(2048);
    const encoder = new TextEncoder();
    expect(encoder.encode(multibyte).byteLength).toBeGreaterThan(2048);
    const res = await post(multibyte, env, true);
    expect(res.status).toBe(413);
    expect(points).toHaveLength(0);
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

  it('accepts a real sender-produced worst-case payload', async () => {
    const { env, points } = makeEnv();
    const res = await post(fixture, env);
    expect(res.status).toBe(204);
    expect(points).toHaveLength(fixture.contributions.length);
  });

  it('sets no cookies on success', async () => {
    const { env } = makeEnv();
    const res = await post(valid, env);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
