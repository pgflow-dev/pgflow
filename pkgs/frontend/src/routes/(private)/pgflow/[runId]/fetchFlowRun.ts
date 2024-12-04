import { type SupabaseClient } from '@supabase/supabase-js';
import type { Flow, Step, Dep, Run, StepState, StepTask } from '$lib/db/pgflow';

type RunWithStatesAndTasks = Run & {
	step_states: StepState[];
	step_tasks: StepTask[];
};

type FlowWithStepsAndDeps = Flow & {
	steps: Step[];
	deps: Dep[];
};

type QueryData = RunWithStatesAndTasks & {
	flow: FlowWithStepsAndDeps;
};

async function executeQuery(supabase: SupabaseClient, runId: string) {
	console.log('executeQuery', { runId });
	return await supabase
		.schema('pgflow')
		.from('runs')
		.select(
			`
				*,
				step_states!step_states_run_id_fkey(*),
				step_tasks!step_tasks_run_id_fkey(*),
				flow:flows!runs_flow_slug_fkey (
					steps!steps_flow_slug_fkey(*),
					deps:deps!deps_flow_slug_fkey (
						flow_slug,
						from_step_slug,
						to_step_slug
					)
				)
		`
		)
		.eq('run_id', runId)
		.single<QueryData>();
}

export default async function fetchFlowRun(supabase: SupabaseClient, runId: string) {
	try {
		const response = await executeQuery(supabase, runId);

		if (!response.data || response.error) {
			throw new Error('No flow data found');
		}

		if (!response.data.flow?.steps || !response.data.flow?.deps) {
			throw new Error('Flow data is incomplete');
		}

		const run = response.data;
		const steps = run.flow.steps;
		const deps = run.flow.deps;

		const stepStatesByStepSlug = run.step_states.reduce(
			(acc, stepState) => {
				acc[stepState.step_slug] = stepState;
				return acc;
			},
			{} as Record<string, StepState>
		);

		const stepTasksByStepSlug = run.step_tasks.reduce(
			(acc, stepTask) => {
				acc[stepTask.step_slug] = stepTask;
				return acc;
			},
			{} as Record<string, StepTask>
		);

		const initialNodes = steps.map((step) => {
			return {
				id: step.step_slug,
				type: 'step_state',
				position: { x: 0, y: 0 },
				data: {
					step,
					label: step.step_slug,
					step_state: stepStatesByStepSlug[step.step_slug],
					step_task: stepTasksByStepSlug[step.step_slug]
				}
			};
		});

		const initialEdges = deps.map((dep) => {
			return {
				id: `${dep.from_step_slug}-${dep.to_step_slug}`,
				type: 'smoothstep',
				animated: true,
				source: dep.from_step_slug,
				target: dep.to_step_slug
			};
		});

		return { nodes: initialNodes, edges: initialEdges };
	} catch (error) {
		console.error('Error fetching flow run:', error);
		throw error instanceof Error ? error : new Error('Failed to fetch flow run');
	}
}
