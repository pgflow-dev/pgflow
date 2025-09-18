import { Flow } from '@pgflow/dsl';

/**
 * Example flow demonstrating the map step functionality
 *
 * This flow shows:
 * 1. Root map - processing array input directly
 * 2. Dependent map - mapping over another step's output
 * 3. Map chaining - one map depending on another
 * 4. Integration with regular steps
 */

// Example 1: Simple root map processing string array
export const TextProcessingFlow = new Flow<string[]>({
  slug: 'text_processing',
  maxAttempts: 3,
})
  // Root map - processes each string in the input array
  .map({ slug: 'normalize' }, (text) => {
    // Each handler receives a single string, not the array
    return text.trim().toLowerCase();
  })
  // Dependent map - processes the normalized strings
  .map({ slug: 'capitalize', array: 'normalize' }, (text) => {
    return text.charAt(0).toUpperCase() + text.slice(1);
  })
  // Regular step that aggregates the results
  .step({ slug: 'summarize', dependsOn: ['capitalize'] }, (input) => ({
    processed: input.capitalize.length,
    results: input.capitalize,
  }));

export const UserEnrichmentFlow = new Flow<{ userIds: string[] }>({
  slug: 'user_enrichment',
})
  // Generate initial data array
  .array({ slug: 'fetch_users' }, async ({ run }) => {
    // Simulating API calls to fetch user data
    return run.userIds.map((id) => ({
      id,
      name: `User_${id}`,
    }));
  })
  // Map over each user to add timestamps
  .map({ slug: 'add_timestamps', array: 'fetch_users' }, (user) => ({
    ...user,
    createdAt: new Date().toISOString(),
    processed: true,
  }))
  // Map to calculate derived fields
  .map({ slug: 'add_metadata', array: 'add_timestamps' }, (user) => ({
    ...user,
    displayName: `${user.name} (${user.id})`,
    hashId: Buffer.from(user.id).toString('base64'),
  }))
  // Final aggregation
  .step({ slug: 'create_report', dependsOn: ['add_metadata'] }, (input) => ({
    totalUsers: input.add_metadata.length,
    processedAt: new Date().toISOString(),
    users: input.add_metadata,
  }));

// Example 3: Numerical computation with maps
export const StatisticsFlow = new Flow<number[]>({
  slug: 'statistics',
})
  // Square each number
  .map({ slug: 'square', maxAttempts: 5 }, (n) => n * n)
  // Calculate cumulative values
  .map({ slug: 'cumulative', array: 'square' }, (value, context) => {
    // Maps can access context just like regular steps
    console.log(`Processing value ${value} with context`, context.env);
    return {
      original: Math.sqrt(value),
      squared: value,
      cubed: value * Math.sqrt(value),
    };
  })
  // Aggregate statistics
  .step({ slug: 'calculate_stats', dependsOn: ['cumulative'] }, (input) => {
    const values = input.cumulative;
    const squares = values.map((v) => v.squared);
    return {
      count: values.length,
      sumOfSquares: squares.reduce((a, b) => a + b, 0),
      average: squares.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...squares),
      min: Math.min(...squares),
    };
  });

// Example 4: Complex nested processing
type OrderItem = {
  productId: string;
  quantity: number;
  price: number;
};

export const OrderProcessingFlow = new Flow<OrderItem[]>({
  slug: 'order_processing',
  timeout: 120,
})
  // Validate each item
  .map({ slug: 'validate_items' }, (item) => {
    const isValid = item.quantity > 0 && item.price > 0;
    return {
      ...item,
      valid: isValid,
      subtotal: item.quantity * item.price,
    };
  })
  // Apply discounts
  .map(
    {
      slug: 'apply_discounts',
      array: 'validate_items',
      baseDelay: 1000,
    },
    (item) => {
      // The item from validate_items has additional fields, but TypeScript can't track that
      // We know it has the shape: { productId, quantity, price, valid, subtotal }
      const itemWithSubtotal = item as typeof item & { subtotal: number; valid: boolean };
      const discount = itemWithSubtotal.quantity >= 10 ? 0.1 : 0;
      const discountAmount = itemWithSubtotal.subtotal * discount;
      return {
        ...itemWithSubtotal,
        discount,
        discountAmount,
        finalPrice: itemWithSubtotal.subtotal - discountAmount,
      };
    }
  )
  // Calculate totals
  .step(
    { slug: 'calculate_order', dependsOn: ['apply_discounts'] },
    (input) => {
      const items = input.apply_discounts;
      const validItems = items.filter((item) => item.valid);

      return {
        orderTotal: validItems.reduce((sum, item) => sum + item.finalPrice, 0),
        totalDiscount: validItems.reduce(
          (sum, item) => sum + item.discountAmount,
          0
        ),
        itemCount: validItems.length,
        invalidItemCount: items.length - validItems.length,
        items: validItems,
      };
    }
  );

// Example 5: Parallel map chains
export const ParallelMapsFlow = new Flow<{
  numbers: number[];
  strings: string[];
}>({
  slug: 'parallel_maps',
})
  // Extract arrays for parallel processing
  .step({ slug: 'extract_numbers' }, ({ run }) => run.numbers)
  .step({ slug: 'extract_strings' }, ({ run }) => run.strings)
  // Process numbers
  .map({ slug: 'double_numbers', array: 'extract_numbers' }, (n) => n * 2)
  .map({ slug: 'square_numbers', array: 'double_numbers' }, (n) => n * n)
  // Process strings
  .map({ slug: 'uppercase_strings', array: 'extract_strings' }, (s) =>
    s.toUpperCase()
  )
  .map({ slug: 'reverse_strings', array: 'uppercase_strings' }, (s) =>
    s.split('').reverse().join('')
  )
  // Combine results
  .step(
    {
      slug: 'combine_results',
      dependsOn: ['square_numbers', 'reverse_strings'],
    },
    (input) => ({
      processedNumbers: input.square_numbers,
      processedStrings: input.reverse_strings,
      numberSum: input.square_numbers.reduce((a, b) => a + b, 0),
      concatenated: input.reverse_strings.join(', '),
    })
  );
