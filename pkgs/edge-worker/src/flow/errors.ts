/**
 * Error thrown when flow shape in code doesn't match database schema in production mode.
 * Worker should crash on this error - no recovery possible without migration.
 */
export class FlowShapeMismatchError extends Error {
  constructor(
    public readonly flowSlug: string,
    public readonly differences: string[]
  ) {
    super(
      `Flow '${flowSlug}' shape mismatch with database.\n` +
      `Run migrations or use development mode to recompile.\n` +
      `Differences:\n` +
      differences.map(d => `  - ${d}`).join('\n')
    );
    this.name = 'FlowShapeMismatchError';
  }
}
