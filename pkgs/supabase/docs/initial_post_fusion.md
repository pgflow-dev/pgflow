Here's my rewrite that maintains the conversational tone of the first article while incorporating technical details from the second:

# Introducing **pgflow**

🤗 Quick heads up: I'm keeping the code under wraps for now – not because I'm being secretive, but because I want to make sure everything's properly documented and polished before sharing it with the world. Having ADHD means I need to be extra thoughtful about how I structure projects like this. But don't worry! I've been absolutely laser-focused on pgflow for the past 7 weeks, and I can't wait to share what I've built.

1. Introduction

   Hey everyone! 👋 I'm Wojtek (known as jumski). I started 2024 with a sabbatical to recharge and explore new technologies. I fell deep into the Supabase ecosystem, and while building various projects, I noticed a gap - there wasn't a workflow engine that felt truly native to the Postgres-first philosophy of Supabase. I wanted something that would let me:

- trigger workflows from SQL and REST api via RPC calls
- monitor execution progress in realtime with Realtime API
- reuse as much of existing infra and library code as possible
- have a simple, type-safe DSL, so I can wire up step handlers effortlessly
- handle complex parallel workflow patterns with built-in retries and error handling

Not a single solution out there was keeping the workflows in the database
and not require any additional infrastructure that complicates the setup
and breaks "its just posgtres with goodies" mentality.

As my sabbatical was coming to an end, I wanted to have something tangible to show
for it - not just to combat the impostor syndrome that often creeps in during
career transitions, but to give back to the community that's given me a new
perspective on building software. After 13 years of Ruby on Rails development,
I found a new home in the Supabase ecosystem, and I wanted to contribute
something meaningful to it. Building **pgflow** became my way of saying "thank you"
while creating a tool that I genuinely wanted to use myself.

2. What is **pgflow**?
   **pgflow** helps you run multi-step, parallel workflows on top of Edge Functions,
   orchestrated and managed via Postgres functions.
   It is built specifically for Supabase projects, so there's nothing extra to set up or maintain.

   Here's what you get:

   - All workflow data lives in your database through workflow state tracking tables
   - Tasks run via Supabase Edge Functions with built-in dependency resolution
   - Define flows in TypeScript with a type-safe DSL that includes compile-time dependency validation
   - Track progress and state of each workflow via Supabase Realtime
   - Easy to extend with custom backends (like Slack approvals)
   - Built-in retries and error handling for robust workflow execution

   The core is just Postgres functions and tables, which means you can trigger or check on
   your workflows with a simple database call.

   I put lot of effort into making this tool really joyful to use:

   - type-safe TypeScript DSL for defining workflows with full type inference for step inputs/outputs
   - CLI tool for 1-minute installation in any Supabase project
   - simple JS SDK for running and monitoring flows live with real-time status updates
   - an extensible SQL core that is open to introducing new step types or custom workers

[Original visualizations and code snippets section remains the same]

3. Current Status and Next Steps

   After 7 weeks of prototyping and testing, here's where we stand:

   Ready and tested:
   - Core SQL engine with workflow state tracking
   - Edge Functions worker implementation with retry logic
   - TypeScript DSL with compile-time validation
   - Real-time monitoring capabilities
   - Basic error handling and retries

   Final steps before beta:
   - CLI tools (project setup + DSL compiler) **🚀 in progress**
   - Project extraction and documentation
   - Testing utilities
   - Monitoring dashboard
   - Workflow versioning

[Original "Call for Beta Testers" section remains the same]
