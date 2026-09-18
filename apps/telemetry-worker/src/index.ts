// pgflow anonymous telemetry ingest. Accepts exactly one closed schema,
// rejects everything else, writes one Analytics Engine data point per
// contribution. No cookies, no body logging, IP only as transport.

export interface Env {
  PGFLOW_TELEMETRY: AnalyticsEngineDataset;
}

const SCHEMA_VERSION = 1;
const MAX_BODY_BYTES = 2048;
const MAX_CONTRIBUTIONS = 64;

const COUNT_BUCKETS = new Set([
  '0', '1', '2-3', '4-7', '8-15', '16-31', '32-63', '64-127', '128-255', '256+',
]);
const STEPS_BUCKETS = new Set(['1', '2-3', '4-7', '8-15', '16-31', '32+']);
const DURATION_BUCKETS = new Set([
  '<100ms', '100-999ms', '1-9.9s', '10-59s', '1-4.9m', '5-29m',
  '30m-1.9h', '2-23h', '1-6d', '7d+',
]);
const OUTCOME_BUCKETS = new Set(['completed', 'failed', 'started']);
const MODE_BUCKETS = new Set(['http', 'process']);
const QUEUE_MODE_BUCKETS = new Set(['flow', 'step']);
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

type BucketKind =
  | 'count' | 'steps' | 'duration' | 'outcome' | 'mode' | 'queue_mode'
  | 'yes' | 'semver';

const METRICS: Record<string, BucketKind> = {
  active_db_day: 'yes',
  workers_by_version: 'semver',
  version_changed: 'yes',
  worker_functions: 'count',
  worker_functions_by_mode: 'mode',
  worker_functions_disabled: 'count',
  workers_started_day: 'count',
  workers_stopped_day: 'count',
  workers_deprecated_day: 'count',
  worker_starts_per_function: 'count',
  steps_per_flow: 'steps',
  uses_map: 'yes',
  uses_root_map: 'yes',
  uses_condition: 'yes',
  uses_graceful_failure: 'yes',
  uses_skip_cascade: 'yes',
  uses_retry_override: 'yes',
  uses_timeout_override: 'yes',
  uses_start_delay: 'yes',
  queue_mode: 'queue_mode',
  runs_started_day: 'count',
  run_outcomes: 'outcome',
  run_wall_duration: 'duration',
  step_wall_duration: 'duration',
  task_attempts_day: 'count',
  map_task_count: 'steps',
};

function validBucket(kind: BucketKind, bucket: unknown): boolean {
  if (typeof bucket !== 'string' || bucket.length > 32) return false;
  switch (kind) {
    case 'count': return COUNT_BUCKETS.has(bucket);
    case 'steps': return STEPS_BUCKETS.has(bucket);
    case 'duration': return DURATION_BUCKETS.has(bucket);
    case 'outcome': return OUTCOME_BUCKETS.has(bucket);
    case 'mode': return MODE_BUCKETS.has(bucket);
    case 'queue_mode': return QUEUE_MODE_BUCKETS.has(bucket);
    case 'yes': return bucket === 'yes';
    case 'semver': return SEMVER_RE.test(bucket);
  }
}

interface Contribution {
  metric?: unknown;
  bucket?: unknown;
  count?: unknown;
}

const reject = (status: number) => new Response(null, {
  status,
  headers: { 'cache-control': 'no-store' },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return reject(405);

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return reject(415);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reject(413);

    let body: { schema?: unknown; contributions?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return reject(400);
    }

    if (body.schema !== SCHEMA_VERSION) return reject(400);
    if (!Array.isArray(body.contributions)) return reject(400);
    const contributions = body.contributions as Contribution[];
    if (contributions.length === 0 || contributions.length > MAX_CONTRIBUTIONS) {
      return reject(400);
    }

    for (const c of contributions) {
      if (c === null || typeof c !== 'object') return reject(400);
      const kind = METRICS[c.metric as string];
      if (!kind) return reject(400);
      if (!validBucket(kind, c.bucket)) return reject(400);
      if (c.count !== undefined) {
        if (typeof c.count !== 'string' || !COUNT_BUCKETS.has(c.count)) {
          return reject(400);
        }
      }
    }

    for (const c of contributions) {
      env.PGFLOW_TELEMETRY.writeDataPoint({
        indexes: [c.metric as string],
        blobs: [c.bucket as string],
        doubles: [1],
      });
    }

    return new Response(null, {
      status: 204,
      headers: { 'cache-control': 'no-store' },
    });
  },
};
