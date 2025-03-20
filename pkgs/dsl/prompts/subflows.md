# Implementing Subflows in pgflow

Subflows allow you to create reusable workflow components while maintaining type safety and a clean, declarative syntax. This document outlines how to implement subflows using a type-safe field mapping approach.

## How Subflows Work

A subflow is a complete workflow that is embedded within another workflow. The parent flow must:

1. Map its own inputs/outputs to the subflow's required inputs
2. Access the subflow's outputs in subsequent steps

## Implementation Example

Let's look at a practical example with a payment processing subflow that's used within an order processing workflow.

### Step 1: Define the Payment Flow

First, we define our reusable payment processing flow:

```typescript
// Define a payment processing flow
const PaymentFlow = new Flow<{
  orderId: string;
  amount: number;
  currency: string;
}>({
  slug: 'payment_flow',
})
  .step({ slug: 'validate_payment' }, async (input) => {
    return validatePayment(
      input.run.orderId,
      input.run.amount,
      input.run.currency
    );
    // Returns { validationToken: string, isValid: boolean }
  })
  .step(
    { slug: 'process_transaction', dependsOn: ['validate_payment'] },
    async (input) => {
      if (!input.validate_payment.isValid) {
        throw new Error('Payment validation failed');
      }
      return processTransaction(
        input.run.orderId,
        input.run.amount,
        input.validate_payment.validationToken
      );
      // Returns { transactionId: string, status: string, timestamp: Date }
    }
  );
```

### Step 2: Use the Payment Flow as a Subflow

Now we can use this payment flow as a subflow in our order processing workflow:

```typescript
// Use PaymentFlow as a subflow in an order processing flow
const OrderFlow = new Flow<{ customerId: string; items: CartItem[] }>({
  slug: 'order_flow',
})
  .step({ slug: 'create_order' }, async (input) => {
    return createOrder(input.run.customerId, input.run.items);
    // Returns { orderId: string, totalAmount: number, currency: string }
  })
  .subflow({
    slug: 'process_payment',
    dependsOn: ['create_order'],
    flow: PaymentFlow,
    input: (input) => ({
      orderId: input.create_order.orderId,
      amount: input.create_order.totalAmount,
      currency: input.create_order.currency || 'USD',
    }),
    output: (subflowOutput) => ({
      transactionId: subflowOutput.process_transaction.transactionId,
      paymentStatus: subflowOutput.process_transaction.status,
      paymentTimestamp: subflowOutput.process_transaction.timestamp,
    }),
  })
  .step(
    { slug: 'finalize_order', dependsOn: ['process_payment'] },
    async (input) => {
      return finalizeOrder(
        input.create_order.orderId,
        input.process_payment.transactionId,
        input.process_payment.paymentStatus
      );
      // Returns { orderStatus: string, completionDate: Date }
    }
  );
```

## Key Properties

The `subflow()` method accepts:

- `slug`: A unique identifier for the subflow step
- `dependsOn`: The steps that must complete before this subflow can be executed
- `flow`: The Flow object to be executed as a subflow
- `input`: A function that maps parent flow data to the subflow's input requirements
- `output`: A function that transforms the subflow's output for easier consumption by subsequent steps

## Type Safety

The entire subflow implementation maintains full type safety:

1. The `input` function is type-checked against the subflow's input requirements
2. The `output` function is type-checked against the subflow's available outputs
3. Subsequent steps in the parent flow can access the transformed subflow outputs with full type information

## Benefits

- **Reusability**: Create workflow components once and reuse them across multiple flows
- **Maintainability**: Update a subflow in one place and all parent flows benefit
- **Clean API**: The input/output mappings provide a clean interface between workflows
- **Type Safety**: Maintain full type checking across flow boundaries
- **Transparency**: The execution engine handles subflows seamlessly, making them appear as normal steps to users
