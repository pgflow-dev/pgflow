---
'@pgflow/edge-worker': minor
---

Add retry strategies with exponential backoff support

Edge Worker now supports configurable retry strategies through a new `retry` configuration object. You can choose between exponential backoff (recommended) or fixed delays.

### Features
- **Exponential backoff**: Delays double with each retry (3s, 6s, 12s...)
- **Fixed delays**: Constant delay between retries
- **Configurable limits**: Set max attempts and delay caps
- **Backwards compatible**: Old `retryLimit`/`retryDelay` fields still work with deprecation warnings

### 💥 Breaking Change
The default retry strategy changed from fixed to exponential backoff. If you rely on fixed delays, update your config:

```ts
// Before (implicit fixed delay)
EdgeWorker.start(handler, {
  retryLimit: 5,
  retryDelay: 3,
});

// After (explicit fixed delay)
EdgeWorker.start(handler, {
  retry: {
    strategy: 'fixed',
    limit: 5,
    baseDelay: 3,
  }
});

// Or use the new default (exponential)
EdgeWorker.start(handler, {
  retry: {
    strategy: 'exponential',
    limit: 5,
    baseDelay: 3,
    maxDelay: 300,
  }
});
```