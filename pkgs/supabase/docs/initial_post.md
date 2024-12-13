# Introducing **pgflow**

🤗 Quick heads up: I'm keeping the code under wraps for now – not because I'm being secretive, but because I want to make sure everything's properly documented and polished before sharing it with the world. Having ADHD means I need to be extra thoughtful about how I structure projects like this. But don't worry! I've been absolutely laser-focused on pgflow for the past 7 weeks, and I can't wait to share what I've built.

1. Introduction

   Hey everyone! 👋 I'm Wojtek (known as jumski). I started 2024 with a sabbatical to recharge and explore new technologies. I fell deep into the Supabase ecosystem, and while building various projects, I noticed a gap - there wasn't a workflow engine that felt truly native to the Postgres-first philosophy of Supabase. I wanted something that would let me:

- trigger workflows from SQL and REST api via RPC calls
- monitor execution progress in realtime with Realtime API
- reuse as much of existing infra and library code as possible
- have a simple, type-safe DSL, so I can wire up step handlers effortlessly

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

   - All workflow data lives in your database
   - Tasks run via Supabase Edge Functions
   - Define flows in TypeScript, trigger them from SQL or REST (RPC)
   - Track progress and state of each workflow via Supabase Realtime
   - Easy to extend with custom backends (like Slack approvals)

   The core is just Postgres functions and tables, which means you can trigger or check on
   your workflows with a simple database call.

   I put lot of effort into making this tool really joyful to use:

   - type-safe TypeScript DSL for defining workflows
   - CLI tool for 1-minute installation in any Supabase project
   - simple JS SDK for running and monitoring flows live
   - an extensible SQL core that is open to introducing new step types or custom workers (see the slack approval idea above)

[Insert screenshot of flow visualization or UI with caption, e.g., "**pgflow** visualizing a workflow."]

[Optional: Insert code snippet showcasing the DSL with caption, e.g., "Defining workflows with **pgflow**'s TypeScript DSL."]

3. Current Status and Next Steps

   After 7 weeks of prototyping and testing, here's where we stand:

   Ready and tested:

   - Core SQL engine
   - Edge Functions worker implementation
   - TypeScript DSL

   Final steps before beta:

   - CLI tools (project setup + DSL compiler) **🚀 in progress**
   - Project extraction and documentation (it lives in my personal monorepo for now)

4. Call for Beta Testers

   I'm getting close to having something that I'd love to put in your hands! Before making **pgflow**
   publicly available, I'm looking for a small group of beta testers who could help me polish
   the rough edges and validate that it solves real-world problems effectively. If you're
   building something with Supabase and need workflow automation, I'd love to hear from you!

   Also, would you be interested in me sharing regular updates about **pgflow**'s development journey
   in the coming weeks? I could post about the challenges, solutions, and interesting technical
   decisions that went into building a Postgres-native workflow engine. Let me know in the
   comments if that's something you'd find valuable!
