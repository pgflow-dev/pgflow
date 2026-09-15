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
 * Error thrown when a flow's queue mode or complete route map doesn't match
 * the persisted deployment metadata in production mode (#651).
 *
 * Changing queue mode or resolved routes in production requires a new
 * concrete flow slug; local mode recompiles automatically.
 */
export class FlowRoutingMismatchError extends Error {
  constructor(
    public readonly flowSlug: string,
    public readonly differences: string[]
  ) {
    super(
      `Flow '${flowSlug}' queue routing mismatch with database.\n` +
      `Changing queue mode or step routes in production requires a new concrete flow slug.\n` +
      `Differences:\n` +
      differences.map(d => `  - ${d}`).join('\n')
    );
    this.name = 'FlowRoutingMismatchError';
  }
}
