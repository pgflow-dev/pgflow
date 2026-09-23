import { describe, expect, it, vi } from 'vitest';
import { reportInstallTelemetry } from '../../../src/commands/install/report-install-telemetry';

const result = { kind: 'update' as const, copied: 5 };

describe('reportInstallTelemetry', () => {
  it.each([
    ['fresh', 12, '8-15'],
    ['update', 5, '4-7'],
    ['noop', 0, '0'],
  ] as const)('reports a successful %s install', async (kind, copied, count) => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await reportInstallTelemetry(
      { kind, copied },
      { env: {}, version: '0.18.0', send },
    );

    expect(send).toHaveBeenCalledOnce();
    const [url, request] = send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pgflow-telemetry.workers.dev/');
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body as string)).toEqual({
      schema: 1,
      contributions: [{
        metric: `cli_install_${kind}`,
        bucket: '0.18.0',
        count,
      }],
    });
  });

  it.each([
    { CI: 'true' },
    { NODE_ENV: 'test' },
    { DO_NOT_TRACK: '1' },
    { PGFLOW_TELEMETRY_DISABLED: 'true' },
  ])('does not report when disabled by $env', async (env) => {
    const send = vi.fn();
    await reportInstallTelemetry(result, { env, version: '0.18.0', send });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not report an invalid version', async () => {
    const send = vi.fn();
    await reportInstallTelemetry(result, { env: {}, version: 'unknown', send });
    expect(send).not.toHaveBeenCalled();
  });

  it('never fails installation when the request fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(
      reportInstallTelemetry(result, { env: {}, version: '0.18.0', send }),
    ).resolves.toBeUndefined();
  });
});
