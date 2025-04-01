import { describe, it } from 'vitest';
import { Flow } from './dsl.ts';

describe('Flow RuntimeOptions', () => {
  it('accepts valid runtime options in Flow constructor', ({ expect }) => {
    expect(
      () =>
        new Flow({
          slug: 'test_flow',
          maxAttempts: 3,
          baseDelay: 100,
          timeout: 30,
        })
    ).not.toThrowError();
  });

  it('accepts missing runtime options in Flow constructor', ({ expect }) => {
    expect(() => new Flow({ slug: 'test_flow' })).not.toThrowError();
  });

  it('rejects invalid maxAttempts in Flow constructor', ({ expect }) => {
    expect(
      () =>
        new Flow({
          slug: 'test_flow',
          maxAttempts: 0,
        })
    ).toThrowError('maxAttempts must be greater than or equal to 1');
  });

  it('rejects invalid baseDelay in Flow constructor', ({ expect }) => {
    expect(
      () =>
        new Flow({
          slug: 'test_flow',
          baseDelay: 0,
        })
    ).toThrowError('baseDelay must be greater than or equal to 1');
  });

  it('rejects invalid timeout in Flow constructor', ({ expect }) => {
    expect(
      () =>
        new Flow({
          slug: 'test_flow',
          timeout: 2,
        })
    ).toThrowError('timeout must be greater than or equal to 3');
  });
});

describe('Step RuntimeOptions', () => {
  const noop = () => null;
  let flow: Flow<any>;

  beforeEach(() => {
    flow = new Flow({ slug: 'test_flow' });
  });

  it('accepts valid runtime options in step method', ({ expect }) => {
    expect(() =>
      flow.step(
        {
          slug: 'test_step',
          maxAttempts: 3,
          baseDelay: 100,
          timeout: 30,
        },
        noop
      )
    ).not.toThrowError();
  });

  it('accepts missing runtime options in step method', ({ expect }) => {
    expect(() => flow.step({ slug: 'test_step' }, noop)).not.toThrowError();
  });

  it('rejects invalid maxAttempts in step method', ({ expect }) => {
    expect(() =>
      flow.step(
        {
          slug: 'test_step',
          maxAttempts: 0,
        },
        noop
      )
    ).toThrowError('maxAttempts must be greater than or equal to 1');
  });

  it('rejects invalid baseDelay in step method', ({ expect }) => {
    expect(() =>
      flow.step(
        {
          slug: 'test_step',
          baseDelay: 0,
        },
        noop
      )
    ).toThrowError('baseDelay must be greater than or equal to 1');
  });

  it('rejects invalid timeout in step method', ({ expect }) => {
    expect(() =>
      flow.step(
        {
          slug: 'test_step',
          timeout: 2,
        },
        noop
      )
    ).toThrowError('timeout must be greater than or equal to 3');
  });
});
