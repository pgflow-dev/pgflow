import { v4 as uuidv4 } from 'uuid';

export function createTestFlow(flowSlug?: string) {
  const uniqueSuffix = `${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 5)}`;

  const maxBaseLength = 48 - uniqueSuffix.length - 1;
  const baseSlug = flowSlug ? flowSlug.slice(0, maxBaseLength) : 'test_flow';

  return {
    slug: `${baseSlug}_${uniqueSuffix}`,
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
