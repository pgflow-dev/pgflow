import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { FlowRow, StepRow, RunRow, StepStateRow } from '@pgflow/core';
import { createNanoEvents } from 'nanoevents';
import type {
  IFlowRealtime,
  BroadcastRunEvent,
  BroadcastStepEvent,
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
  #reconnectionTimeoutMs = 2000;

  /**
   * Creates a new instance of SupabaseBroadcastAdapter
   *
   * @param supabase - Supabase client instance
   */
  constructor(supabase: SupabaseClient) {
    this.#supabase = supabase;
  }
  
  /**
   * Handle broadcast messages from Supabase
   * @param payload - The message payload
   */
  #handleBroadcastMessage(payload: any): void {
    const event = payload.event as string;
    const eventData = payload.payload;

    if (event.startsWith('run:')) {
      // Handle run events
      this.#emitter.emit('runEvent', eventData as BroadcastRunEvent);
    } else if (event.startsWith('step:')) {
      // Handle step events
      this.#emitter.emit('stepEvent', eventData as BroadcastStepEvent);
    }
  }
  
  /**
   * Handle channel errors and reconnection
   * @param run_id - The run ID
   * @param channelName - The channel name
   * @param channel - The RealtimeChannel instance
   * @param error - The error object
   */
  async #handleChannelError(
    run_id: string,
    channelName: string,
    channel: RealtimeChannel,
    error: any
  ): Promise<void> {
    console.error(`Channel ${channelName} error:`, error);
    
    // Schedule reconnection attempt
    setTimeout(async () => {
      if (this.#channels.has(run_id)) {
        await this.#reconnectChannel(run_id, channelName, channel);
      }
    }, this.#reconnectionTimeoutMs);
  }
  
  /**
   * Reconnect to a channel and refresh state
   * @param run_id - The run ID
   * @param channelName - The channel name
   * @param channel - The RealtimeChannel instance
   */
  async #reconnectChannel(
    run_id: string,
    channelName: string,
    channel: RealtimeChannel
  ): Promise<void> {
    console.log(`Attempting to reconnect to ${channelName}`);
    
    try {
      // Fetch current state to avoid missing events during disconnection
      const currentState = await this.getRunWithStates(run_id);
      
      // Update state based on current data
      this.#refreshStateFromSnapshot(run_id, currentState);
      
      // Resubscribe to the channel
      channel.subscribe();
    } catch (e) {
      console.error(`Failed to reconnect to ${channelName}:`, e);
    }
  }
  
  /**
   * Refresh client state from a state snapshot
   * @param run_id - The run ID
   * @param state - The state snapshot
   */
  #refreshStateFromSnapshot(
    run_id: string,
    state: { run: RunRow; steps: StepStateRow[] } | null
  ): void {
    if (!state || !state.run) return;
    
    // Emit run event
    this.#emitter.emit('runEvent', {
      event_type: `run:${state.run.status}`,
      ...state.run
    } as unknown as BroadcastRunEvent);
    
    // Emit events for each step state
    if (state.steps && Array.isArray(state.steps)) {
      for (const step of state.steps) {
        this.#emitter.emit('stepEvent', {
          event_type: `step:${step.status}`,
          ...step
        } as unknown as BroadcastStepEvent);
      }
    }
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
      .eq('flow_slug', flow_slug)
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
      steps: steps as StepRow[],
    };
  }

  /**
   * Registers a callback for run events
   *
   * @param callback - Function to call when run events are received
   * @returns Function to unsubscribe from the event
   */
  onRunEvent(callback: (event: BroadcastRunEvent) => void): Unsubscribe {
    // Add a guard to prevent errors if called after emitter is deleted
    const unsubscribe = this.#emitter.on('runEvent', callback);
    return () => {
      try {
        unsubscribe();
      } catch (e) {
        console.warn('Could not unsubscribe from run event - emitter may have been disposed', e);
      }
    };
  }

  /**
   * Registers a callback for step events
   *
   * @param callback - Function to call when step events are received
   * @returns Function to unsubscribe from the event
   */
  onStepEvent(callback: (event: BroadcastStepEvent) => void): Unsubscribe {
    // Add a guard to prevent errors if called after emitter is deleted
    const unsubscribe = this.#emitter.on('stepEvent', callback);
    return () => {
      try {
        unsubscribe();
      } catch (e) {
        console.warn('Could not unsubscribe from step event - emitter may have been disposed', e);
      }
    };
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
      return () => this.unsubscribe(run_id);
    }

    const channel = this.#supabase.channel(channelName);

    // Use a single listener without event filtering and do the filtering in code
    // This is because Supabase Realtime doesn't support wildcards in event filters
    channel.on('broadcast', { event: '*' }, this.#handleBroadcastMessage.bind(this));

    // Handle channel lifecycle events
    channel.on('subscribed', () => {
      console.log(`Subscribed to channel ${channelName}`);
    });

    channel.on('closed', () => {
      console.log(`Channel ${channelName} closed`);
    });

    channel.on('error', (error) => 
      this.#handleChannelError(run_id, channelName, channel, error)
    );

    channel.subscribe();
    this.#channels.set(run_id, channel);

    return () => this.unsubscribe(run_id);
  }
  
  /**
   * Unsubscribes from a run's events
   * 
   * @param run_id - Run ID to unsubscribe from
   */
  unsubscribe(run_id: string): void {
    this.#unsubscribe(run_id);
  }

  /**
   * Fetches current state of a run and its steps
   *
   * @param run_id - Run ID to fetch
   */
  async getRunWithStates(run_id: string): Promise<{
    run: RunRow;
    steps: StepStateRow[];
  }> {
    // Call the RPC function (will need to be created in SQL)
    const { data, error } = await this.#supabase
      .schema('pgflow')
      .rpc('get_run_with_states', { run_id });

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
