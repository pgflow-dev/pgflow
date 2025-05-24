import { v4 as uuidv4 } from 'uuid';

export function createTestFlow() {
  return {
    slug: `test_flow_${Date.now()}`,
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