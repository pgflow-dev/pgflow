<div align="center">
  <h1>Edge Worker</h1>
  <a href="https://pgflow.dev">
    <h3>📚 Documentation @ pgflow.dev</h3>
  </a>
  
  <h4>⚠️ <strong>ADVANCED PROOF of CONCEPT - NOT PRODUCTION READY</strong> ⚠️</h4>
</div>

A task queue worker for Supabase Edge Functions that extends background tasks with useful features.

> [!NOTE]
> This project is licensed under [AGPL v3](./LICENSE.md) license and is part of **pgflow** stack.
> See [LICENSING_OVERVIEW.md](../../LICENSING_OVERVIEW.md) in root of this monorepo for more details.

## What is Edge Worker?

Edge Worker processes messages from a queue and executes user-defined functions with their payloads. It builds upon [Supabase Background Tasks](https://supabase.com/docs/guides/functions/background-tasks) to add reliability features like retries, concurrency control and monitoring.

## Key Features

- ⚡ **Reliable Processing**: Retries with configurable delays
- 🔄 **Concurrency Control**: Limit parallel task execution
- 📊 **Observability**: Built-in heartbeats and logging
- 📈 **Horizontal Scaling**: Deploy multiple edge functions for the same queue
- 🛡️ **Edge-Native**: Designed for Edge Functions' CPU/clock limits

## How It Works

[![Architecture Diagram](https://mermaid.ink/img/pako:eNplkcFugzAMhl8lyrl9AQ47VLBxqdSqlZAGHEziASokyEkmTaXvvoR0o1VziGL_n_9Y9pULLZEnvFItwdSxc1op5o9xTUxU_OQmaMAgy2SL7N0pYXutTMUjGU5WlItYaLog1VFAJSv14paCXdweyw8f-2MZLnZ06LBelXxXRk_DztAM-Gp9KA-kpRP-W7bdvs3Ga4aNaAy0OC_WdzD4B4IQVsLMvvkIZMUiA4mu_8ZHYjW5MxNp4dUnKC9zUHJA-h9R_VQTG-sQyDYINlTs-IaPSCP00q_gGvCK2w5HP53EPyXQJczp5jlwVp9-lOCJJYcbTtq13V_gJgkW0x78lEeefMFgfHYC9an1GqPsraZ9XPiy99svlAqmtA?type=png)](https://mermaid.live/edit#pako:eNplkcFugzAMhl8lyrl9AQ47VLBxqdSqlZAGHEziASokyEkmTaXvvoR0o1VziGL_n_9Y9pULLZEnvFItwdSxc1op5o9xTUxU_OQmaMAgy2SL7N0pYXutTMUjGU5WlItYaLog1VFAJSv14paCXdweyw8f-2MZLnZ06LBelXxXRk_DztAM-Gp9KA-kpRP-W7bdvs3Ga4aNaAy0OC_WdzD4B4IQVsLMvvkIZMUiA4mu_8ZHYjW5MxNp4dUnKC9zUHJA-h9R_VQTG-sQyDYINlTs-IaPSCP00q_gGvCK2w5HP53EPyXQJczp5jlwVp9-lOCJJYcbTtq13V_gJgkW0x78lEeefMFgfHYC9an1GqPsraZ9XPiy99svlAqmtA)

## Edge Function Optimization

Edge Worker is specifically designed to handle Edge Function limitations:

- Stops polling near CPU/clock limits
- Gracefully aborts pending tasks
- Uses PGMQ's visibility timeout to prevent message loss
- Auto-spawns new instances for continuous operation
- Monitors worker health with database heartbeats


## Documentation

For detailed documentation and getting started guide, visit [pgflow.dev](https://pgflow.dev).

