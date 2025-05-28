import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { FlowRow, StepRow, RunRow, StepStateRow } from '@pgflow/core';
import { createNanoEvents } from 'nanoevents';
import type {
  IFlowRealtime,
  BroadcastRunEvent,
  BroadcastStepEvent,
  Unsubscribe,
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
  #reconnectionDelay: number;
  #schedule: typeof setTimeout;
  

  /**
   * Creates a new instance of SupabaseBroadcastAdapter
   *
   * @param supabase - Supabase client instance
   */
  constructor(
    supabase: SupabaseClient,
    opts: { reconnectDelayMs?: number; schedule?: typeof setTimeout } = {}
  ) {
    this.#supabase = supabase;
    this.#reconnectionDelay = opts.reconnectDelayMs ?? 2000;
    this.#schedule = opts.schedule ?? setTimeout;
  }
  
  /**
   * Handle broadcast messages from Supabase
   * @param payload - The message payload
   */
  #handleBroadcastMessage(msg: { 
    event: string; 
    payload: BroadcastRunEvent | BroadcastStepEvent;
  }): void {
    const { event, payload } = msg;
    
    // run_id is already inside the payload coming from the database trigger
    // so just preserve it without overwriting
    const eventData = payload;

    // Auto-parse JSON strings in broadcast data (realtime sends JSONB as strings)
    this.#parseJsonFields(eventData);

    if (event.startsWith('run:')) {
      // Handle run events
      this.#emitter.emit('runEvent', eventData as BroadcastRunEvent);
    } else if (event.startsWith('step:')) {
      // Handle step events
      this.#emitter.emit('stepEvent', eventData as BroadcastStepEvent);
    }
  }

  /**
   * Parse JSON string fields in broadcast event data
   * @param eventData - The event data object to parse
   */
  #parseJsonFields(eventData: any): void {
    // Parse output field if it's a JSON string
    if ('output' in eventData && typeof eventData.output === 'string') {
      try {
        eventData.output = JSON.parse(eventData.output);
      } catch (e) {
        // Keep as string if not valid JSON
      }
    }
    
    // Parse input field if it's a JSON string
    if ('input' in eventData && typeof eventData.input === 'string') {
      try {
        eventData.input = JSON.parse(eventData.input);
      } catch (e) {
        // Keep as string if not valid JSON
      }
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
    error: unknown
  ): Promise<void> {
    console.error(`Channel ${channelName} error:`, error);
    
    // Schedule reconnection attempt
    this.#schedule(async () => {
      if (this.#channels.has(run_id)) {
        await this.#reconnectChannel(run_id, channelName);
      }
    }, this.#reconnectionDelay);
  }
  
  /**
   * Creates and configures a channel for a run
   * @param run_id - The run ID
   * @param channelName - The channel name
   * @returns The configured RealtimeChannel
   */
  #createAndConfigureChannel(run_id: string, channelName: string): RealtimeChannel {
    const channel = this.#supabase.channel(channelName);
    
    // Listen to *all* broadcast messages; filter inside the handler.
    // Using the 3-arg overload with event filter for proper Supabase v2 client compatibility.
    channel.on('broadcast', { event: '*' }, this.#handleBroadcastMessage.bind(this));
    
    // Note: Lifecycle event listeners (subscribed, closed, error) are handled 
    // by the calling code to avoid conflicts when multiple listeners try to 
    // handle the same events.
    
    return channel;
  }
  
  /**
   * Reconnect to a channel and refresh state
   * @param run_id - The run ID
   * @param channelName - The channel name
   */
  async #reconnectChannel(
    run_id: string,
    channelName: string
  ): Promise<void> {
    console.log(`Attempting to reconnect to ${channelName}`);
    
    try {
      // Fetch current state to avoid missing events during disconnection
      const currentState = await this.getRunWithStates(run_id);
      
      // Update state based on current data
      this.#refreshStateFromSnapshot(run_id, currentState);
      
      // Create a new channel as the old one can't be reused
      const newChannel = this.#createAndConfigureChannel(run_id, channelName);
      
      // Set up lifecycle event handlers for reconnection
      newChannel.on('system', { event: 'subscribed' }, () => {
        console.log(`Reconnected and subscribed to channel ${channelName}`);
      });
      
      newChannel.on('system', { event: 'closed' }, () => {
        console.log(`Reconnected channel ${channelName} closed`);
      });
      
      newChannel.on('system', { event: 'error' }, (payload) => 
        this.#handleChannelError(run_id, channelName, newChannel, payload.error)
      );
      
      // Subscribe and update the channels map
      newChannel.subscribe();
      this.#channels.set(run_id, newChannel);
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
    
    // Create proper run event with correct event_type
    const runEvent: BroadcastRunEvent = {
      event_type: `run:${state.run.status}`,
      ...state.run
    } as unknown as BroadcastRunEvent;
    
    // Emit run event
    this.#emitter.emit('runEvent', runEvent);
    
    // Emit events for each step state
    if (state.steps && Array.isArray(state.steps)) {
      for (const step of state.steps) {
        // Create proper step event with correct event_type
        const stepEvent: BroadcastStepEvent = {
          event_type: `step:${step.status}`,
          ...step
        } as unknown as BroadcastStepEvent;
        
        // Emit step event
        this.#emitter.emit('stepEvent', stepEvent);
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
    // Fetch flow details and steps in parallel
    const [flowResult, stepsResult] = await Promise.all([
      this.#supabase
        .schema('pgflow')
        .from('flows')
        .select('*')
        .eq('flow_slug', flow_slug)
        .single(),
      this.#supabase
        .schema('pgflow')
        .from('steps')
        .select('*')
        .eq('flow_slug', flow_slug)
        .order('step_index', { ascending: true })
    ]);

    // Handle flow result
    if (flowResult.error) throw flowResult.error;
    if (!flowResult.data) throw new Error(`Flow "${flow_slug}" not found`);

    // Handle steps result
    if (stepsResult.error) throw stepsResult.error;
    
    // Ensure steps is always an array, even if it's null or undefined
    const stepsArray = Array.isArray(stepsResult.data) ? stepsResult.data : [];

    return {
      flow: flowResult.data as FlowRow,
      steps: stepsArray as StepRow[],
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

  // Store unsubscribe functions per run ID for reference equality
  #unsubscribeFunctions: Map<string, () => void> = new Map();

  /**
   * Wait for a channel to be ready by polling its status
   * @param channel - The RealtimeChannel to wait for
   * @param channelName - Channel name for logging
   */
  async #waitForChannelReady(channel: RealtimeChannel, channelName: string): Promise<void> {
    const maxAttempts = 50; // 5 seconds max (50 * 100ms)
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const status = channel.state;
      console.log(`Channel ${channelName} status: ${status}`);
      
      if (status === 'joined') {
        console.log(`Channel ${channelName} is ready (joined)`);
        return;
      }
      
      if (status === 'closed' || status === 'errored') {
        throw new Error(`Channel ${channelName} failed to join: ${status}`);
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    throw new Error(`Channel ${channelName} timeout: failed to join after ${maxAttempts * 100}ms`);
  }

  /**
   * Subscribes to a flow run's events
   *
   * @param run_id - Run ID to subscribe to
   * @param channelName - Optional custom channel name (defaults to pgflow:run:{run_id})
   * @returns Function to unsubscribe
   */
  async subscribeToRun(run_id: string, channelName?: string): Promise<() => void> {
    const actualChannelName = channelName || `pgflow:run:${run_id}`;

    // If already subscribed, return the existing unsubscribe function
    if (this.#channels.has(run_id)) {
      const existingUnsubscribe = this.#unsubscribeFunctions.get(run_id);
      if (existingUnsubscribe) {
        return existingUnsubscribe;
      }
      // If channel exists but no unsubscribe function, something went wrong
      // Let's clean up and recreate
      this.#unsubscribe(run_id);
    }

    const channel = this.#supabase.channel(actualChannelName);
    
    // Listen to *all* broadcast messages; filter inside the handler.
    // Using the 3-arg overload with event filter for proper Supabase v2 client compatibility.
    channel.on('broadcast', { event: '*' }, this.#handleBroadcastMessage.bind(this));
    
    // Set up error handling
    channel.on('system', { event: 'closed' }, () => {
      console.log(`Channel ${actualChannelName} closed`);
    });
    channel.on('system', { event: 'error' }, (payload) => {
      console.log(`Channel ${actualChannelName} error:`, payload);
      this.#handleChannelError(run_id, actualChannelName, channel, payload.error);
    });
    
    // Subscribe to channel and wait for confirmation (like the working realtime-send test)
    console.log(`Subscribing to channel ${actualChannelName}...`);
    
    const subscriptionPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Subscription timeout for channel ${actualChannelName}`));
      }, 5000);
      
      channel.subscribe((status) => {
        console.log(`Channel ${actualChannelName} subscription status:`, status);
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
        // Don't reject on CHANNEL_ERROR - it's a transient state
        // Only reject on timeout
      });
    });
    
    // Wait for the 'SUBSCRIBED' acknowledgment to avoid race conditions
    await subscriptionPromise;
    
    this.#channels.set(run_id, channel);

    const unsubscribe = () => this.unsubscribe(run_id);
    this.#unsubscribeFunctions.set(run_id, unsubscribe);
    return unsubscribe;
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
    // Call the RPC function which returns a JSONB object
    const { data, error } = await this.#supabase
      .schema('pgflow')
      .rpc('get_run_with_states', { run_id });

    if (error) throw error;
    if (!data) throw new Error(`No data returned for run ${run_id}`);
    
    return data as { run: RunRow; steps: StepStateRow[] };
  }

  /**
   * Unsubscribes from a run's events
   *
   * @param run_id - Run ID to unsubscribe from
   */
  #unsubscribe(run_id: string): void {
    const channel = this.#channels.get(run_id);
    if (channel) {
      // Close the channel
      channel.unsubscribe();
      this.#channels.delete(run_id);
      
      // Also clean up the unsubscribe function reference
      this.#unsubscribeFunctions.delete(run_id);
      
      // We don't need to explicitly remove event listeners from the emitter
      // as they will be garbage collected when no longer referenced.
      // The event listeners are bound to specific callbacks provided by the client,
      // which will retain references if they're still in use.
    }
  }
}
