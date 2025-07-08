import type { AnyFlow } from '@pgflow/dsl';
import type { PgmqMessageRecord } from '../queue/types.js';
import type { 
  StepTaskWithMessage,
  SupabaseResources,
  SupabaseMessageContext,
  SupabaseStepTaskContext
} from '../core/context.js';
import type { PlatformAdapter } from './types.js';
import type { Sql } from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DenoAdapter } from './DenoAdapter.js';
import { memoize } from '../core/memoize.js';
import { createSql } from '../core/sql-factory.js';
import { createAnonSupabaseClient, createServiceSupabaseClient } from '../core/supabase-factories.js';

/**
 * Supabase-specific platform adapter that extends DenoAdapter
 * with Supabase-specific context creation methods
 */
export class SupabasePlatformAdapter extends DenoAdapter implements PlatformAdapter<SupabaseResources> {
  private abortController: AbortController;
  private _sql: Sql | null = null;
  private _anonSupabase: SupabaseClient | null = null;
  private _serviceSupabase: SupabaseClient | null = null;

  // Memoized resource factories
  private getSql: () => Sql;
  private getAnonSupabase: () => SupabaseClient;
  private getServiceSupabase: () => SupabaseClient;

  constructor() {
    super();
    
    // Create abort controller for shutdown signal
    this.abortController = new AbortController();
    
    // Setup memoized factories
    this.getSql = memoize(() => {
      if (!this._sql) {
        this._sql = createSql(this.env);
      }
      return this._sql;
    });

    this.getAnonSupabase = memoize(() => {
      if (!this._anonSupabase) {
        this._anonSupabase = createAnonSupabaseClient(this.env);
      }
      return this._anonSupabase;
    });

    this.getServiceSupabase = memoize(() => {
      if (!this._serviceSupabase) {
        this._serviceSupabase = createServiceSupabaseClient(this.env);
      }
      return this._serviceSupabase;
    });
  }

  /**
   * Get the shutdown signal that fires when the worker is shutting down
   */
  get shutdownSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Create a context for message handlers
   */
  createMessageContext<TPayload>(
    message: PgmqMessageRecord<TPayload>
  ): SupabaseMessageContext<TPayload> {
    return {
      // Core platform resources
      env: this.env,
      shutdownSignal: this.shutdownSignal,
      
      // Message execution context
      rawMessage: message,
      
      // Supabase-specific resources
      sql: this.getSql(),
      anonSupabase: this.getAnonSupabase(),
      serviceSupabase: this.getServiceSupabase()
    };
  }

  /**
   * Create a context for step task handlers
   */
  createStepTaskContext<TFlow extends AnyFlow>(
    taskWithMessage: StepTaskWithMessage<TFlow>
  ): SupabaseStepTaskContext<TFlow> {
    return {
      // Core platform resources
      env: this.env,
      shutdownSignal: this.shutdownSignal,
      
      // Step task execution context
      rawMessage: taskWithMessage.message,
      stepTask: taskWithMessage.task,
      
      // Supabase-specific resources
      sql: this.getSql(),
      anonSupabase: this.getAnonSupabase(),
      serviceSupabase: this.getServiceSupabase()
    };
  }

  async stopWorker(): Promise<void> {
    // Trigger shutdown signal
    this.abortController.abort();
    
    // Cleanup resources
    if (this._sql) {
      await this._sql.end();
    }
    
    // Call parent cleanup
    await super.stopWorker();
  }
}