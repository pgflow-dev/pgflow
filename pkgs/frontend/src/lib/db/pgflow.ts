import type { Json } from '$backend/types';
import { type Database } from '$lib/db';

export type Flow = Database['pgflow']['Tables']['flows']['Row'];
export type Step = Database['pgflow']['Tables']['steps']['Row'];
export type Dep = Database['pgflow']['Tables']['deps']['Row'];
export type Run = Database['pgflow']['Tables']['runs']['Row'];
export type StepState = Database['pgflow']['Tables']['step_states']['Row'];
export type StepTask = Database['pgflow']['Tables']['step_tasks']['Row'];

export type RunFlowRpc = Database['pgflow']['Functions']['run_flow'];
export type RunFlow = {
	flow_slug: string;
	run_id: string;
	status: string;
	payload: Json;
};
