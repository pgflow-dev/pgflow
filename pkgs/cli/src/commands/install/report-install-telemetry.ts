import { getVersion } from '../../utils/get-version.js';
import type { MigrationInstallResult } from './copy-migrations.js';

const ENDPOINT = 'https://pgflow-telemetry.workers.dev/';
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

type Environment = Record<string, string | undefined>;
type Send = typeof globalThis.fetch;

const isSet = (value: string | undefined) => {
  const normalized = value?.toLowerCase();
  return normalized !== undefined
    && normalized !== ''
    && normalized !== '0'
    && normalized !== 'false';
};

function telemetryDisabled(env: Environment): boolean {
  return env.NODE_ENV === 'test'
    || isSet(env.CI)
    || isSet(env.DO_NOT_TRACK)
    || isSet(env.PGFLOW_TELEMETRY_DISABLED);
}

function bucketCount(value: number): string {
  if (value === 0) return '0';
  if (value === 1) return '1';
  if (value <= 3) return '2-3';
  if (value <= 7) return '4-7';
  if (value <= 15) return '8-15';
  if (value <= 31) return '16-31';
  if (value <= 63) return '32-63';
  if (value <= 127) return '64-127';
  if (value <= 255) return '128-255';
  return '256+';
}

export async function reportInstallTelemetry(
  result: MigrationInstallResult,
  {
    env = process.env,
    version = getVersion(),
    send = globalThis.fetch,
  }: { env?: Environment; version?: string; send?: Send } = {},
): Promise<void> {
  if (telemetryDisabled(env) || version.length > 32 || !SEMVER_RE.test(version)) {
    return;
  }

  try {
    await send(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema: 1,
        contributions: [{
          metric: `cli_install_${result.kind}`,
          bucket: version,
          count: bucketCount(result.copied),
        }],
      }),
      signal: AbortSignal.timeout(500),
    });
  } catch {
    // Telemetry must never delay or fail installation.
  }
}
