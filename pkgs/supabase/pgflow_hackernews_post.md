**Title:** Show HN: pgflow – Workflow Engine for Supabase with Multi-Language Flexibility

---

Hey HN,

I've been working on **pgflow**, an open-source workflow engine that leverages PostgreSQL for transactional workflow state management. It's designed to integrate seamlessly with Supabase, making it perfect for Supabase apps.

**Why pgflow?**

- **Ideal for Supabase Developers:** Start quickly using Supabase Edge Functions as your worker—no extra infrastructure needed.
- **Scalable and Flexible:** As your app grows, you can migrate your TypeScript workflows to a dedicated Graphile Worker (self-hosted or managed in the future).
- **Multi-Language Workers:** Besides TypeScript, pgflow supports Python (via pgqueuer) and SQL procedures. This flexibility lets you choose the best language for each task.
- **Perfect for AI and Agentic Workflows:**
  - **Python Support:** Run machine learning models on GPU instances within your workflows.
  - **Typed Workflows:** Optional JSON Schema typing enhances validation and integrates well with AI workflows.
  - **Advanced Control Flow:** Supports parallel execution, branching, and looping, ideal for complex AI tasks.

**Key Features:**

- **Database-Centric Workflows:** Manages workflow state directly in PostgreSQL, ensuring ACID compliance and simplifying your architecture.
- **Parallel Execution with DAGs:** Define workflows as Directed Acyclic Graphs to enable parallel execution of steps.
- **Flexible Data Handling:** Use JSONB columns to store run payloads and step results, with optional typing for validation.
- **Simplified Error Handling:** Leverages task queues for retries and error management, keeping the core engine lightweight.

**Get Started:**

- **GitHub Repository:** [github.com/yourusername/pgflow](#) *(Replace with the actual link)*
- **Comprehensive Documentation:** Detailed guides and examples are available in the [Documentation](#).
- **Join the Community:** Connect with us on Discord to share feedback and get support.

I'm excited to share pgflow with the HN community. It's perfect for Supabase apps—you can start simple and, as your needs grow, scale up to more powerful workers like Graphile Worker. Whether you're building standard applications or complex AI workflows, pgflow adapts to your stack.

Your feedback and suggestions are invaluable—looking forward to your thoughts!

---

*Edit:* Just pushed updates based on early feedback. Thanks for checking it out!
