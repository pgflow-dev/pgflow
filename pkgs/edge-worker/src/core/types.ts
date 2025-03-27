export type { Json } from '../../../core/src/types.ts';

export interface IPoller<IMessage> {
  poll(): Promise<IMessage[]>;
}

export interface IExecutor {
  get msgId(): number;
  execute(): Promise<unknown>;
}

export interface IMessage {
  msg_id: number;
}

export interface ILifecycle {
  acknowledgeStart(workerBootstrap: WorkerBootstrap): Promise<void>;
  acknowledgeStop(): void;
  sendHeartbeat(): Promise<void>;

  get edgeFunctionName(): string | undefined;
  get queueName(): string;
  get isRunning(): boolean;
  get isStopping(): boolean;
  get isStopped(): boolean;

  transitionToStopping(): void;
}

export interface IBatchProcessor {
  processBatch(): Promise<void>;
  awaitCompletion(): Promise<void>;
}

export type WorkerRow = {
  last_heartbeat_at: string;
  queue_name: string;
  started_at: string;
  stopped_at: string | null;
  worker_id: string;
  function_name: string;
};

export interface WorkerBootstrap {
  edgeFunctionName: string;
  workerId: string;
}
