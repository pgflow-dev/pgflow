import { Flow } from '../../src/index.js';
import { describe, expectTypeOf, it } from 'vitest';

interface FinalizeContextOutput {
  sessionId: string;
  sonioxTranscriptionId: string;
  isTerminal: boolean;
}

describe('.step() supports interface DTO outputs', () => {
  it('keeps dependent step input precise for interface-based output', () => {
    new Flow<{ id: string }>({ slug: 'interface-output-flow' })
      .step({ slug: 'finalizeContext' }, async () => {
        const result: FinalizeContextOutput = {
          sessionId: 's1',
          sonioxTranscriptionId: 't1',
          isTerminal: false,
        };

        return result;
      })
      .step(
        {
          slug: 'next',
          dependsOn: ['finalizeContext'],
          if: { finalizeContext: { isTerminal: false } },
        },
        (deps) => {
          expectTypeOf(deps.finalizeContext.sessionId).toEqualTypeOf<string>();
          expectTypeOf(
            deps.finalizeContext.sonioxTranscriptionId
          ).toEqualTypeOf<string>();

          return { ok: true };
        }
      );
  });
});
