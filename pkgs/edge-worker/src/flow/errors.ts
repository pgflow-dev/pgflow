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

/**
 * Error thrown when the database's worker startup protocol does not match
 * this worker's queue-capable protocol (#650). Old and new sides must be
 * upgraded together; rolling old/new workers are unsupported.
 */
export class QueueProtocolMismatchError extends Error {
  constructor(
    public readonly flowSlug: string,
    detail: string
  ) {
    super(
      `Flow '${flowSlug}' requires a coordinated pgflow upgrade.\n` +
      `${detail}\n` +
      `Deploy the queue-aware pgflow packages and database migration together; ` +
      `running old and new workers side by side is unsupported.`
    );
    this.name = 'QueueProtocolMismatchError';
  }
}
