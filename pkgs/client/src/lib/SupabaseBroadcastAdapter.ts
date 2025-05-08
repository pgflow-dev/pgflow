import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { FlowRow, StepRow, RunRow, StepStateRow } from '@pgflow/core';
import { createNanoEvents } from 'nanoevents';
import type { 
  IFlowRealtime, 
  BroadcastRunEvent, 
  BroadcastStepEvent 
} from './types';

// Define the events interface for the adapter
interface AdapterEvents {
  runEvent: (event: BroadcastRunEvent) => void;
  stepEvent: (event: BroadcastStepEvent) => void;
}

/**
 * Adapter to handle realtime communication with Supabase
 */
export class SupabaseBroadcastAdapter implements IFlowRealtime {
  #supabase: SupabaseClient;
  #channels: Map<string, RealtimeChannel> = new Map();
  #emitter = createNanoEvents<AdapterEvents>();
  
  /**
   * Creates a new instance of SupabaseBroadcastAdapter
   * 
   * @param supabase - Supabase client instance
   */
  constructor(supabase: SupabaseClient) {
    this.#supabase = supabase;
  }
  
  /**
   * Fetches flow definition metadata from the database
   * 
   * @param flow_slug - Flow slug to fetch
   */
  async fetchFlowDefinition(flow_slug: string): Promise<{
    flow: FlowRow;
    steps: StepRow[];
  }> {
    // Fetch flow details
    const { data: flow, error: flowError } = await this.#supabase
      .schema('pgflow')
      .from('flows')
      .select('*')
      .eq('slug', flow_slug)
      .single();
    
    if (flowError) throw flowError;
    if (!flow) throw new Error(`Flow "${flow_slug}" not found`);
    
    // Fetch steps for this flow
    const { data: steps, error: stepsError } = await this.#supabase
      .schema('pgflow')
      .from('steps')
      .select('*')
      .eq('flow_slug', flow_slug)
      .order('step_index', { ascending: true });
    
    if (stepsError) throw stepsError;
    
    return { 
      flow: flow as FlowRow, 
      steps: steps as StepRow[] 
    };
  }
  
  /**
   * Registers a callback for run events
   * 
   * @param callback - Function to call when run events are received
   * @returns Function to unsubscribe from the event
   */
  onRunEvent(callback: (event: BroadcastRunEvent) => void): Unsubscribe {
    return this.#emitter.on('runEvent', callback);
  }
  
  /**
   * Registers a callback for step events
   * 
   * @param callback - Function to call when step events are received
   * @returns Function to unsubscribe from the event
   */
  onStepEvent(callback: (event: BroadcastStepEvent) => void): Unsubscribe {
    return this.#emitter.on('stepEvent', callback);
  }
  
  /**
   * Subscribes to a flow run's events
   * 
   * @param run_id - Run ID to subscribe to
   * @returns Function to unsubscribe
   */
  subscribeToRun(run_id: string): () => void {
    const channelName = `pgflow:run:${run_id}`;
    
    // If already subscribed, return the existing unsubscribe function
    if (this.#channels.has(run_id)) {
      return () => this.#unsubscribe(run_id);
    }
    
    const channel = this.#supabase.channel(channelName);
    
    // Subscribe to run events
    channel.on('broadcast', { event: 'run:*' }, (payload) => {
      const eventData = payload.payload as BroadcastRunEvent;
      this.#emitter.emit('runEvent', eventData);
    });
    
    // Subscribe to step events - match pattern like "step_slug:started"
    channel.on('broadcast', { event: '*:*' }, (payload) => {
      const eventParts = payload.event.split(':');
      // Only process if not a run event and has valid format
      if (eventParts.length === 2 && eventParts[0] !== 'run') {
        const eventData = payload.payload as BroadcastStepEvent;
        this.#emitter.emit('stepEvent', eventData);
      }
    });
    
    channel.subscribe();
    this.#channels.set(run_id, channel);
    
    return () => this.#unsubscribe(run_id);
  }
  
  /**
   * Fetches current state of a run and its steps
   * 
   * @param run_id - Run ID to fetch
   */
  async getRunWithStates(run_id: string): Promise<{ 
    run: RunRow; 
    steps: StepStateRow[] 
  }> {
    // Call the RPC function (will need to be created in SQL)
    const { data, error } = await this.#supabase.rpc('pgflow.get_run_with_states', {
      p_run_id: run_id
    });
    
    if (error) throw error;
    return data;
  }
  
  /**
   * Unsubscribes from a run's events
   * 
   * @param run_id - Run ID to unsubscribe from
   */
  #unsubscribe(run_id: string): void {
    const channel = this.#channels.get(run_id);
    if (channel) {
      channel.unsubscribe();
      this.#channels.delete(run_id);
    }
  }
}