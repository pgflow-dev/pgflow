**Title:** Show HN: pgflow – A Flexible, Database-Centric Workflow Engine with Multi-Language Workers

---

Hey HN,

I've been working on **pgflow**, an open-source workflow management system that leverages PostgreSQL for robust, transactional workflow state management while providing flexibility through multiple worker implementations.

**What's New?**

Unlike traditional workflow engines that are tightly coupled with specific runtimes, pgflow separates workflow definitions and state management (handled within PostgreSQL) from the execution of workflow steps (handled by various worker adapters). This separation allows for:

- **Transactionality:** Workflow state updates are managed within the database, ensuring ACID compliance.
- **Idempotent Work Handlers:** By designing your work handlers to be idempotent, you achieve robustness and flexibility in your workflows.
- **Multiple Worker Adapters:** Currently, pgflow supports the following worker implementations:

  - **Supabase Edge Functions:** Run background workflows on your Supabase projects without additional infrastructure.
  - **pgqueuer in Python**
  - **Graphile Worker in TypeScript**
  - **SQL Procedures**

- **Mix and Match Workers:** You can use different workers within the same workflow; each step can be run by a different worker based on your needs.

**Data Handling:**

- **Run Payload and Step Results:** Both are stored in JSONB columns in the database. Steps can "return" data and have side effects.
- **Optional Typing:** You can provide JSON Schemas stored in the step definition rows to type your payloads and results.

**DSL for Workflow Definitions:**

We also provide a domain-specific language (DSL) for defining and type-annotating workflows and steps. This allows you to implement steps in various languages while maintaining a clear and consistent workflow definition.

**Why pgflow?**

- **Flexibility:** Use the best tool for each job by combining different worker implementations and languages.
- **Scalability:** Built on PostgreSQL, pgflow leverages the database's scalability and reliability.
- **Simplicity:** By handling workflow state within the database, you reduce external dependencies and simplify your architecture.

**Getting Started:**

- **Source Code:** [GitHub Repository](#) *(Link to the repository)*
- **Documentation:** Detailed setup instructions and examples are available in the README.
- **Examples:** Check out the examples folder for sample workflows using different worker adapters.

I'm excited to share pgflow with the community and would love to hear your thoughts, feedback, and suggestions!

*— OP*

---

### Comments:

**user1234:**

This looks fantastic! Being able to mix and match different workers within the same workflow is a game-changer. How does pgflow handle coordination between different worker types?

---

**dbenthusiast:**

I love the idea of using Supabase Edge Functions as workers. Does this mean I can run complex workflows without setting up any backend servers?

---

**criticalthinker:**

I'm curious about the performance implications. Does managing workflow state in PostgreSQL create any bottlenecks, especially under heavy load?

---

**OP:**

@user1234 Great question! Coordination is managed through the workflow state in the database. Each worker checks the database for steps it's responsible for and executes them accordingly. Since the state is centralized, workers can operate independently yet cohesively.

---

**devnull42:**

Combining multiple languages in workflows sounds powerful but potentially complex. How do you ensure consistency and manage dependencies across different languages?

---

**sqlwizard:**

Storing step results in JSONB columns is clever. Can you elaborate on how the optional JSON Schemas work for typing payloads and results?

---

**OP:**

@dbenthusiast Exactly! With Supabase Edge Functions, you can run your workflows entirely on Supabase without additional infrastructure. It's perfect for serverless applications.

---

**microserviceguy:**

Does pgflow support distributed transactions, or is everything committed within a single database transaction?

---

**OP:**

@criticalthinker Valid concern. PostgreSQL is quite efficient at handling concurrent transactions, but it's essential to monitor and optimize your database performance as your workload grows. Since the workflow execution is offloaded to workers, the database primarily handles state updates.

---

**happycamper:**

This is exactly what I've been looking for! Being able to define workflows in a DSL and implement steps in different languages is super helpful.

---

**skeptic_alex:**

Mixing multiple worker types seems like it could get complicated quickly. How do you handle error handling and retries across different worker implementations?

---

**OP:**

@devnull42 Good point. We provide a DSL for defining workflows, which helps maintain consistency. Dependencies are managed through the workflow definitions, and each worker is responsible for handling steps implemented in its language.

---

**securitybuff:**

How secure is pgflow, especially with multiple workers accessing the database? What measures are in place to prevent unauthorized access?

---

**OP:**

@sqlwizard Thanks! The optional JSON Schemas allow you to define the expected structure of your payloads and step results. This helps with validation and ensures that each step receives the data it expects, reducing runtime errors.

---

**datadude:**

Can you provide more details on how the workers poll or are notified of new steps to execute? Is there a pub/sub mechanism?

---

**OP:**

@microserviceguy pgflow manages transactions within the database, but workers execute steps asynchronously. If you need distributed transactions, you'd need to handle that within your worker implementations.

---

**scripter:**

Any plans to add more worker adapters? For example, integrating with AWS Lambda or other cloud functions?

---

**OP:**

@skeptic_alex Error handling and retries are indeed important. Each worker implementation can handle retries based on its capabilities. Since the state is stored in the database, workers can check the status and re-attempt failed steps as needed.

---

**pgfan99:**

This project has a lot of potentials. How can the community contribute? Are you open to pull requests?

---

**OP:**

@securitybuff Security is a priority. Each worker connects to the database using appropriate credentials, and you can set up role-based access control to restrict permissions. It's important to configure your database security settings carefully.

---

**codecritic:**

How does pgflow handle versioning of workflows? If I update a workflow definition, how does it affect in-progress runs?

---

**OP:**

@datadude Workers can poll the database for pending steps they're responsible for, or you can use database notifications (like LISTEN/NOTIFY in PostgreSQL) for real-time updates. The mechanism depends on the worker implementation.

---

**opensourceadvocate:**

Is there a license for pgflow? I'd like to know before considering it for my projects.

---

**OP:**

@scripter Yes! We're planning to add more worker adapters. Contributions are welcome, so if you're interested in integrating AWS Lambda or other services, we'd be happy to collaborate.

---

**devops_guru:**

How do you handle migrations when you have multiple workers and potentially long-running workflows in flight?

---

**OP:**

@pgfan99 Absolutely! The project is open-source, and we welcome contributions. Feel free to open issues or submit pull requests on GitHub.

---

**john_doe_dev:**

This is intriguing. How do you debug workflows when steps are implemented in different languages and run in different environments?

---

**OP:**

@codecritic Workflow versioning is an important aspect. Currently, if you update a workflow definition, it doesn't affect in-progress runs since their steps are already defined. For major changes, you might consider versioning your workflows and migrating runs as needed.

---

**linuxnerd:**

Is there any plan to support other databases like MySQL or is this PostgreSQL-specific due to its advanced features?

---

**OP:**

@opensourceadvocate Yes, pgflow is released under the MIT License. You can use it freely in your projects.

---

**finalthought:**

This seems like a solid foundation for building complex workflows. Thanks for sharing this with the community!

---

**OP:**

@devops_guru Migrations can be tricky with in-flight workflows. It's crucial to plan schema changes carefully and ensure backward compatibility. Using transactional migrations and versioned workflow definitions can help minimize disruptions.

---

**OP:**

@john_doe_dev Debugging across different environments requires good logging and monitoring practices. Each worker should log its execution details, and since the state is centralized in the database, you can trace the workflow execution there.

---

**OP:**

@linuxnerd Currently, pgflow is PostgreSQL-specific to leverage its JSONB support and advanced features like LISTEN/NOTIFY. Supporting other databases would require significant adjustments.

---

**OP:**

Thanks everyone for the great questions and feedback! I'm excited to see how pgflow evolves with community involvement.

---

*Feel free to continue the discussion or ask more questions!*
