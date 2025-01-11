---
title: "Versioning: always new flow"
draft: true
---

Encouraging users to create new workflows instead of modifying existing ones can be an effective strategy for handling versioning in PGFlow. This approach simplifies version management by treating each significant change as a new workflow.

#### Simplicity

Users don't need to worry about complex versioning mechanisms.

#### Isolation

New workflows are entirely separate, preventing conflicts with existing jobs.

#### Clarity

It's clear which version of the workflow is being used, as each has a distinct name.

### Potential Challenges:

#### Workflow Proliferation

Over time, the number of workflows may grow, making management cumbersome.

#### User Experience

Users need to manage multiple workflows, which might be confusing.

#### Reusing Logic

If workflows share common logic, duplicating code across workflows could become an issue.

### Mitigation Strategies:

Naming Conventions: Implement a naming scheme that includes version numbers (e.g., MyWorkflow_v1, MyWorkflow_v2).
Shared Modules: Extract common code into shared modules or libraries to avoid duplication.
Documentation: Provide clear guidelines on managing multiple workflows and best practices.
