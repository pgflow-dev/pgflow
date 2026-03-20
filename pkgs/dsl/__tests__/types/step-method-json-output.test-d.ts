import { Flow, type StepOutput } from '../../src/index.js';
import { describe, expectTypeOf, it } from 'vitest';

interface InterfaceJsonDto {
  sessionId: string;
  isTerminal: boolean;
}

describe('.step() JSON output constraints', () => {
  it('accepts JSON-compatible step outputs', () => {
    new Flow<{ x: string }>({ slug: 'test' })
      .step({ slug: 'valid1' }, () => ({ ok: true }))
      .step({ slug: 'valid2' }, () => ({ maybe: null as string | null }))
      .step({ slug: 'valid3' }, () => ['a', 'b', 'c'])
      .step({ slug: 'valid4' }, () => null)
      .step({ slug: 'valid5' }, () => 123)
      .step({ slug: 'valid6' }, () => {
        const dto: InterfaceJsonDto = {
          sessionId: 's1',
          isTerminal: false,
        };

        return dto;
      })
      .step({ slug: 'valid7' }, (): { entryId?: string } => ({
        entryId: 'entry-1',
      }))
      .step({ slug: 'valid8' }, (): { entryId?: string } => ({}))
      // implied optional via inferred branch return (not explicit annotation)
      .step({ slug: 'valid9' }, () =>
        Math.random() > 0.5 ? { entryId: 'entry-1' } : {}
      )
      .step({ slug: 'valid10', dependsOn: ['valid9'] }, (deps) => ({
        payload:
          Math.random() > 0.5
            ? { nested: { tag: deps.valid9.entryId ?? 'missing' } }
            : {},
      }))
      .step({ slug: 'valid11' }, () => {
        const include = Math.random() > 0.5;
        return {
          kind: 'ok',
          ...(include ? { note: 'ready' } : {}),
        };
      });
  });

  it('preserves discriminated unions for step outputs', () => {
    type Decision =
      | { kind: 'approved'; code: 200 }
      | { kind: 'rejected'; code: 403 };

    const flow1 = new Flow<{ x: string }>({ slug: 'test_union_1' }).step(
      { slug: 'decision' },
      (): Decision =>
        Math.random() > 0.5
          ? { kind: 'approved', code: 200 }
          : { kind: 'rejected', code: 403 }
    );

    type JobState =
      | { state: 'queued'; attempts: 0 }
      | { state: 'running'; attempts: 1 }
      | { state: 'done'; attempts: 2 };

    const flow2 = new Flow<{ x: string }>({ slug: 'test_union_2' }).step(
      { slug: 'job' },
      (): JobState =>
        Math.random() > 0.66
          ? { state: 'queued', attempts: 0 }
          : Math.random() > 0.33
          ? { state: 'running', attempts: 1 }
          : { state: 'done', attempts: 2 }
    );

    type NestedEvent =
      | { event: { type: 'created'; id: 'c-1' } }
      | { event: { type: 'deleted'; id: 'd-1' } };

    const flow3 = new Flow<{ x: string }>({ slug: 'test_union_3' }).step(
      { slug: 'evt' },
      (): NestedEvent =>
        Math.random() > 0.5
          ? { event: { type: 'created', id: 'c-1' } }
          : { event: { type: 'deleted', id: 'd-1' } }
    );

    expectTypeOf<
      StepOutput<typeof flow1, 'decision'>
    >().toEqualTypeOf<Decision>();
    expectTypeOf<StepOutput<typeof flow2, 'job'>>().toEqualTypeOf<JobState>();
    expectTypeOf<
      StepOutput<typeof flow3, 'evt'>
    >().toEqualTypeOf<NestedEvent>();
  });

  it('preserves tuple contracts for step outputs', () => {
    const flow1 = new Flow<{ x: string }>({ slug: 'test_tuple_1' }).step(
      { slug: 'coords' },
      (): [number, number] => [10, 20]
    );

    const flow2 = new Flow<{ x: string }>({ slug: 'test_tuple_2' }).step(
      { slug: 'packet' },
      (): ['ok' | 'err', number, boolean] => ['ok', 7, true]
    );

    const flow3 = new Flow<{ x: string }>({ slug: 'test_tuple_3' })
      .step({ slug: 'range' }, (): { bounds: [min: number, max: number] } => ({
        bounds: [1, 9],
      }))
      .step({ slug: 'use_range', dependsOn: ['range'] }, (deps) => {
        expectTypeOf(deps.range.bounds).toEqualTypeOf<[number, number]>();
        return { ok: true };
      });

    expectTypeOf<StepOutput<typeof flow1, 'coords'>>().toEqualTypeOf<
      [number, number]
    >();
    expectTypeOf<StepOutput<typeof flow2, 'packet'>>().toEqualTypeOf<
      ['ok' | 'err', number, boolean]
    >();
    expectTypeOf<StepOutput<typeof flow3, 'range'>>().toEqualTypeOf<{
      bounds: [number, number];
    }>();
  });

  it('preserves exact literal codes and flags for step outputs', () => {
    const flow1 = new Flow<{ x: string }>({ slug: 'test_literals_1' }).step(
      { slug: 'code_200' },
      (): 200 => 200
    );

    const flow2 = new Flow<{ x: string }>({ slug: 'test_literals_2' }).step(
      { slug: 'flag_true' },
      (): true => true
    );

    type HttpMeta = { statusCode: 201; ok: true; retryable: false };

    const flow3 = new Flow<{ x: string }>({ slug: 'test_literals_3' })
      .step(
        { slug: 'meta' },
        (): HttpMeta => ({
          statusCode: 201,
          ok: true,
          retryable: false,
        })
      )
      .step({ slug: 'use_meta', dependsOn: ['meta'] }, (deps) => {
        expectTypeOf(deps.meta.statusCode).toEqualTypeOf<201>();
        expectTypeOf(deps.meta.ok).toEqualTypeOf<true>();
        expectTypeOf(deps.meta.retryable).toEqualTypeOf<false>();
        return { ok: true };
      });

    expectTypeOf<StepOutput<typeof flow1, 'code_200'>>().toEqualTypeOf<200>();
    expectTypeOf<StepOutput<typeof flow2, 'flag_true'>>().toEqualTypeOf<true>();
    expectTypeOf<StepOutput<typeof flow3, 'meta'>>().toEqualTypeOf<HttpMeta>();
  });

  it('rejects undefined in step outputs', () => {
    new Flow<{ x: string }>({ slug: 'test_invalid' })
      // @ts-expect-error - undefined is not Json
      .step({ slug: 'invalid1' }, () => undefined)
      // @ts-expect-error - property type includes undefined (not Json)
      .step({ slug: 'invalid2' }, () => ({
        ok: true,
        maybe: undefined as string | undefined,
      }))
      // @ts-expect-error - implied branch includes explicit undefined value
      .step({ slug: 'invalid5' }, () =>
        Math.random() > 0.5 ? { entryId: 'entry-1' } : { entryId: undefined }
      )
      // @ts-expect-error - top-level undefined branch is not Json
      .step({ slug: 'invalid6' }, () =>
        Math.random() > 0.5 ? { entryId: 'entry-1' } : undefined
      )
      // @ts-expect-error - nested property type includes undefined
      .step({ slug: 'invalid7' }, () => ({
        meta: {
          maybe: undefined as string | undefined,
        },
      }))
      // @ts-expect-error - array element includes undefined
      .step({ slug: 'invalid8' }, () =>
        Math.random() > 0.5 ? ['ok'] : [undefined as string | undefined]
      );
  });

  it('rejects other non-JSON output types', () => {
    new Flow<{ x: string }>({ slug: 'test_invalid_other' })
      // @ts-expect-error - symbol is not Json
      .step({ slug: 'invalid3' }, () => Symbol('x'))
      // @ts-expect-error - function is not Json
      .step({ slug: 'invalid4' }, () => () => 'nope');
  });
});
