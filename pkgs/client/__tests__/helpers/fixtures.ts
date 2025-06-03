import { v4 as uuidv4 } from 'uuid';

export function createTestFlow(flowSlug?: string) {
  const uniqueSuffix = `${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 5)}`;
  return {
    slug: flowSlug
      ? `${flowSlug}_${uniqueSuffix}`
      : `test_flow_${uniqueSuffix}`,
    options: {},
  };
}

export function createTestRun() {
  return {
    run_id: uuidv4(),
    flow_slug: `test_flow_${Date.now()}`,
    input: { test: true },
  };
}

export function createTestStep() {
  return {
    step_slug: `test_step_${Date.now()}`,
    options: {},
  };
}
