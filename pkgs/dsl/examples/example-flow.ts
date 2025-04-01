// Example usage
export const ExampleFlow = new Flow<{ value: number }>({
  slug: 'example_flow',
  maxAttempts: 3,
})
  // rootStep return type will be inferred to:
  //
  // { doubledValue: number; };
  .step({ slug: 'rootStep' }, async (input) => ({
    doubledValue: input.run.value * 2,
  }))
  // normalStep return type will be inferred to:
  // { doubledValueArray: number[] };
  // The input will only include 'run' and 'rootStep' properties
  .step(
    { slug: 'normalStep', dependsOn: ['rootStep'], maxAttempts: 5 },
    async (input) => ({
      doubledValueArray: [input.rootStep.doubledValue],
    })
  )
  // This step depends on normalStep, so its input will include 'run', 'normalStep'
  // but not 'rootStep' since it's not directly declared as a dependency
  .step({ slug: 'thirdStep', dependsOn: ['normalStep'] }, async (input) => ({
    // input.rootStep would be a type error since it's not in dependsOn
    finalValue: input.normalStep.doubledValueArray.length,
  }));

export const stepTaskRecord: StepTaskRecord<typeof ExampleFlow> = {
  flow_slug: 'example_flow',
  run_id: '123',
  step_slug: 'thirdStep',
  // TODO; this input should be typed based on the `step_slug` above
  //       so it should only accept the properties for the thirdStep
  input: {
    run: { value: 23 },
    rootStep: { doubledValue: 23 },
    thirdStep: { finalValue: 23 },
    normalStep: { doubledValueArray: [1, 2, 3] },
  },
  msg_id: 1,
};
