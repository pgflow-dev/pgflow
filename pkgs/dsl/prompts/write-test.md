1. **Dependencies Validation**:
   - Ensures `dependsOn` can only reference steps that exist in the flow
   - Validates that dependencies must be string literals
   - Confirms valid dependencies work correctly

2. **Step Handler Input Typing**:
   - Verifies the input includes the run payload and exactly the declared dependencies
   - Ensures non-dependency steps aren't accessible in the payload

3. **getStepDefinition Typing**:
   - Confirms the handler input and return types are correctly preserved
   - Verifies the types match the step's position in the flow

4. **Circular Dependencies**:
   - Attempts to catch circular dependencies (though TypeScript can't catch all cases)

5. **Multi-step Flow Validation**:
   - Ensures types propagate correctly through multiple steps
   - Verifies each step's input and output types are maintained
