import { describe, it } from 'vitest';
import { Flow } from './dsl.ts';

describe('Flow slug', () => {
  it('can set a Flow slug', ({ expect }) => {
    const flow = new Flow({ slug: 'hello_world' });
    expect(flow.slug).toEqual('hello_world');
  });

  it('does not allow for slug to start with a number', () => {
    expect(() => new Flow({ slug: '1hello_world' })).toThrowError(/cannot/);
  });

  it('does not allow for slug to start with an underscore', () => {
    expect(() => new Flow({ slug: '_hello_world' })).toThrowError(/cannot/);
  });

  it('does not allow for slug to contain a space', () => {
    expect(() => new Flow({ slug: 'hello world' })).toThrowError(/cannot/);
  });

  it('does not allow for slug to contain a slash', () => {
    expect(() => new Flow({ slug: 'hello/world' })).toThrowError(/cannot/);
  });

  it('does not allow for slug to contain a colon', () => {
    expect(() => new Flow({ slug: 'hello:world' })).toThrowError(/cannot/);
  });

  it('does not allow for slug to contain a question mark', () => {
    expect(() => new Flow({ slug: 'hello?world' })).toThrowError(/cannot/);
  });

  it('does not allow for slug to contain a hash', () => {
    expect(() => new Flow({ slug: 'hello#world' })).toThrowError(/cannot/);
  });

  it('does not allow for slug to be longer than 128 chars', () => {
    const longSlug = 'a'.repeat(129);

    expect(() => new Flow({ slug: longSlug })).toThrowError(/cannot/);
  });
});

describe('Step slug', () => {
  const flow = new Flow({ slug: 'hello_world' });
  const noop = () => null;

  it('can set a step slug', ({ expect }) => {
    expect(() => flow.step({ slug: 'hello_world' }, noop)).not.toThrowError();
  });

  it('does not allow for slug to start with a number', () => {
    expect(() => flow.step({ slug: '1hello_world' }, noop)).toThrowError(
      /cannot/
    );
  });

  it('does not allow for slug to start with an underscore', () => {
    expect(() => flow.step({ slug: '_hello_world' }, noop)).toThrowError(
      /cannot/
    );
  });

  it('does not allow for slug to contain a space', () => {
    expect(() => flow.step({ slug: 'hello world' }, noop)).toThrowError(
      /cannot/
    );
  });

  it('does not allow for slug to contain a slash', () => {
    expect(() => flow.step({ slug: 'hello/world' }, noop)).toThrowError(
      /cannot/
    );
  });

  it('does not allow for slug to contain a colon', () => {
    expect(() => flow.step({ slug: 'hello:world' }, noop)).toThrowError(
      /cannot/
    );
  });

  it('does not allow for slug to contain a question mark', () => {
    expect(() => flow.step({ slug: 'hello?world' }, noop)).toThrowError(
      /cannot/
    );
  });

  it('does not allow for slug to contain a hash', () => {
    expect(() => flow.step({ slug: 'hello#world' }, noop)).toThrowError(
      /cannot/
    );
  });

  it('does not allow for slug to be longer than 128 chars', () => {
    const longSlug = 'a'.repeat(129);

    expect(() => flow.step({ slug: longSlug }, noop)).toThrowError(/cannot/);
  });
});
