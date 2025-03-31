# Flow DSL - Step Input Type Construction

This document explains how the input type for a step handler is constructed based on the Flow's input type and the return types of its dependency handlers.

## Input Type Composition

The input type for each step handler is automatically constructed by combining:

1. **Base Run Input** - The original input type provided when creating the Flow (`Flow<Input>`)
2. **Dependency Outputs** - The return types from all dependency handlers

## Construction Rules

### Root Steps (No Dependencies)
For steps with no dependencies:
- Input type contains only the `run` property
- `run` contains the original Flow input type
- Type structure: `{ run: Input }`

### Dependent Steps
For steps with dependencies:
1. The `run` property is always included (containing the original Flow input)
2. Each dependency adds a property to the input object:
   - Property name: The step slug of the dependency
   - Property type: The return type of that dependency's handler
3. Type structure: `{ run: Input } & { [dependencySlug]: DependencyReturnType }`

## Example Breakdown

Using the provided ScrapeWebsiteFlow example:

1. `table_of_contents` (root step):
   - Input type: `{ run: { url: string } }`

2. `subpages` (depends on `table_of_contents`):
   - Input type: `{ 
       run: { url: string }, 
       table_of_contents: { urls_of_subpages: string[], title: string } 
     }`

3. `summaries` (depends on `subpages`):
   - Input type: `{ 
       run: { url: string }, 
       subpages: { contentsOfSubpages: any } 
     }`

4. `save_to_db` (depends on multiple steps):
   - Input type: `{ 
       run: { url: string },
       subpages: { contentsOfSubpages: any },
       summaries: any,
       sentiments: any
     }`

## Key Characteristics

1. **Automatic Composition**: The input type is automatically constructed based on the flow's dependency graph
2. **Type Safety**: Each step handler knows exactly what properties will be available in its input
3. **Run Property**: Always available in every step, containing the original flow input
4. **Dependency Isolation**: Each dependency's output is namespaced under its step slug
5. **No Circular Dependencies**: The type system prevents circular dependencies in the flow definition

This automatic type construction ensures that step handlers always receive properly typed inputs based on their position in the flow's dependency graph.
