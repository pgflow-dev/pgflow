# Brainstorming Subflow Solutions for pgflow

Let's explore various ways to implement a subflow mechanism that would allow for reusable workflow components while maintaining the declarative, type-safe nature of the Flow DSL.

## Core Challenges

1. **Input/Output Mapping**: How to map parent flow inputs/outputs to subflow inputs/outputs
2. **Type Safety**: Maintaining type inference across flow boundaries
3. **Declarative Style**: Keeping the DSL clean and readable
4. **Execution Model**: Handling the execution spanning multiple flows

## Solution Ideas

### Approach 1: Direct Subflow Invocation

A simple approach that calls another flow directly:

```typescript
.step(
  { slug: "process_data" },
  async (input) => {
    // Manually call another flow and wait for results
    const result = await AnotherFlow.run({
      dataId: input.run.recordId,
      options: input.configuration.processingOptions
    });
    return {
      processedData: result.output.finalStep,
      processingTime: result.executionTime
    };
  }
)
```

**Pros**: Simple to implement, works with current design
**Cons**: Not declarative, loses the DAG structure visibility

### Approach 2: Dedicated Subflow Step Type

Add a specialized step type for subflows with mapping declarations:

```typescript
.subflow({
  slug: "data_enrichment",
  dependsOn: ["fetch_data"],
  flow: DataEnrichmentFlow,
  inputMap: (input) => ({
    rawData: input.fetch_data.content,
    options: input.run.enrichmentOptions
  }),
  outputMap: (subflowOutput) => ({
    enrichedData: subflowOutput.transform.result,
    metadata: subflowOutput.analyze.metrics
  })
})
```

**Pros**: Fully declarative, maintains type safety, clear mapping
**Cons**: More complex implementation, requires mapping functions

### Approach 3: Inline Subflow Definition

Embed subflow definition directly within parent flow:

```typescript
.subflow(
  {
    slug: "validation_chain",
    dependsOn: ["fetch_user"]
  },
  (subflow) => subflow
    .step(
      { slug: "validate_email" },
      async (input) => validateEmail(input.fetch_user.email)
    )
    .step(
      { slug: "validate_permissions" },
      async (input) => checkPermissions(input.fetch_user.id, input.run.resourceId)
    )
)
```

**Pros**: Self-contained, no external dependencies
**Cons**: Less reusable, could get unwieldy for large subflows

### Approach 4: Compositional Approach with Path Mapping

Use a composition pattern with explicit path mappings:

```typescript
.compose({
  slug: "user_validation",
  dependsOn: ["fetch_user"],
  flow: ValidationFlow,
  inputs: {
    "userId": "fetch_user.id",
    "email": "fetch_user.email",
    "resource": "run.resourceId"
  },
  outputs: {
    "isValid": "validate_permissions.allowed",
    "validationErrors": "validate_email.errors"
  }
})
```

**Pros**: Very explicit, declarative mapping using paths
**Cons**: Path strings lack type safety

### Approach 5: Type-Safe Field Selector Approach

Use type-safe field selectors instead of string paths:

```typescript
.subflow({
  slug: "process_payment",
  dependsOn: ["get_customer", "create_cart"],
  flow: PaymentProcessingFlow,
  inputs: {
    customerId: (input) => input.get_customer.id,
    amount: (input) => input.create_cart.totalAmount,
    currency: (input) => input.run.preferredCurrency || "USD"
  },
  extraOptions: {
    retries: 3,
    concurrency: 1
  }
})
```

**Pros**: Fully type-safe, flexible mapping with transformations
**Cons**: More verbose for simple mappings

### Approach 6: Typed Factory Pattern

Use a factory function that ensures type compatibility:

```typescript
.step(
  { slug: "enrich_data", dependsOn: ["fetch_data"] },
  createSubflowHandler({
    flow: DataEnrichmentFlow,
    prepare: (input) => ({
      rawData: input.fetch_data.content,
      config: input.run.processingConfig
    }),
    extract: (result) => ({
      enrichedData: result.output.enhance,
      processingMetrics: result.metrics
    })
  })
)
```

**Pros**: Type-safe, works with current flow structure
**Cons**: Not as declarative as dedicated syntax

### Approach 7: Complete Flow Embedding

A hybrid approach that embeds one flow into another with namespace isolation:

```typescript
.embed({
  slug: "authentication",
  flow: AuthFlow,
  inputMap: {
    username: "run.credentials.username",
    password: "run.credentials.password"
  },
  outputPrefix: "auth" // Creates auth.token, auth.userId, etc.
})
```

**Pros**: Maintains isolation between flows, clean namespace
**Cons**: May require special handling for cross-flow dependencies

## Implementation Example: Type-Safe `.subflow()`

Here's a more detailed example of how the type-safe field selector approach (Approach 5) might look in practice:

```typescript
// Define a payment processing flow
const PaymentFlow = new Flow<{ orderId: string; amount: number }>({
  slug: 'payment_flow',
})
  .step({ slug: 'validate_payment' }, async (input) =>
    validatePayment(input.run.orderId, input.run.amount)
  )
  .step(
    { slug: 'process_transaction', dependsOn: ['validate_payment'] },
    async (input) =>
      processTransaction(
        input.run.orderId,
        input.validate_payment.validationToken
      )
  );

// Use it as a subflow in an order processing flow
const OrderFlow = new Flow<{ customerId: string; items: CartItem[] }>({
  slug: 'order_flow',
})
  .step({ slug: 'create_order' }, async (input) =>
    createOrder(input.run.customerId, input.run.items)
  )
  .subflow({
    slug: 'process_payment',
    dependsOn: ['create_order'],
    flow: PaymentFlow,
    inputs: {
      orderId: (input) => input.create_order.orderId,
      amount: (input) => input.create_order.totalAmount,
    },
  })
  .step(
    { slug: 'finalize_order', dependsOn: ['process_payment'] },
    async (input) =>
      finalizeOrder(
        input.create_order.orderId,
        input.process_payment.process_transaction.transactionId
      )
  );
```

In this example:

- `OrderFlow` uses `PaymentFlow` as a subflow
- Inputs are mapped explicitly with type-safe functions
- The output of the subflow is accessible using the subflow slug + original step slugs

## Conclusion

Based on the requirements and the current design of pgflow, **Approach 5 (Type-Safe Field Selector)** seems to be the most promising. It offers:

1. **Type safety** throughout the mapping process
2. **Declarative style** consistent with the rest of the DSL
3. **Flexibility** to transform data during mapping
4. **Clear boundaries** between flows for better organization

A subflow implementation like this would allow creating libraries of reusable workflow components while maintaining the clean, declarative style of the Flow DSL and preserving the type safety that makes the current implementation so powerful.
