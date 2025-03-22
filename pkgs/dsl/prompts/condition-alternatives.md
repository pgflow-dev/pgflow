## Brainstorming Alternatives to JSON Containment `@>` for Step Conditions

Below are various ideas for how to define and evaluate “conditions” on a step’s input, while still satisfying the constraints you outlined. Each approach aims to remain statically typed, only match the step’s input, be serializable to JSON, and avoid implementing a new DSL or separate custom operators.

---

### 1. Use PostgreSQL JSONPath Evaluations
Postgres supports JSONPath queries via functions like [`jsonb_path_exists`](https://www.postgresql.org/docs/current/functions-json.html#FUNCTIONS-SQLJSON-PATH). You could store the JSONPath expression in a JSON object and then evaluate it against the step’s combined input at runtime:

```sql
-- Step condition data stored as JSON:
-- e.g. { "type": "jsonpath", "expression": "$.website.content ? (@ like_regex \"^Hello.*\")" }

SELECT jsonb_path_exists(
  payload, 
  condition->>'expression'
);
```

**Characteristics**  
- **Statically typed**: You can maintain a TypeScript type that restricts which property paths are valid, for example with a string-literal type for domain-specific JSONPath expressions.  
- **Single function**: PostgreSQL has a single function to evaluate arbitrary JSONPath expressions, so you don’t need to manually implement each comparison.  
- **JSON-based**: The condition can be stored as JSON with a `"jsonpath"` key.  
- **No raw SQL**: The `"expression"` is still a string, but the actual caller is the built-in `jsonb_path_exists`, which means you do not need to craft dynamic SQL.

**Downsides**  
- Complex textual JSONPath expressions can be tricky to type-check at compile time unless you build advanced TS generics.  

---

### 2. Embed a “Condition Schema” with Built-in Operators
You can store a small “condition schema” (like an AST) in JSON, referencing the step’s typed properties. A single Postgres function interprets that schema and performs the check. The schema might look like:

```json
{
  "type": "comparison",
  "lhsPath": ["website", "contentLength"],
  "operator": "gt",
  "rhsValue": 1000
}
```

Then at runtime:

```sql
-- Hypothetical function: 
-- `evaluate_condition(payload JSONB, condition JSONB) RETURNS bool`
-- that interprets the "operator" string and does the check without separate DSL code.

SELECT evaluate_condition(payload, condition);
```

**Characteristics**  
- **Statically typed**: In TypeScript, you can ensure `lhsPath` only references valid properties of the known input shape.  
- **Single function**: All operators (`gt`, `eq`, `like`, etc.) are recognized by a single evaluator function inside Postgres.  
- **JSON-based**: The entire condition is a JSON object.  
- **No re-implementing operators**: You do need to parse `condition->>'operator'` but only in one place. Any new operator is recognized by the single function’s branching logic.  

**Downsides**  
- The internal function that interprets `operator` must handle each operator branch. However, that is one single location, and you don’t need a sprawling DSL – just a small piece of code.  

---

### 3. Storing an Array of “Partial Objects” to Match with `@>` 
Instead of a single containment check, you could chain multiple partial objects in an array, each of which must match:

```json
[
  { "website": { "status": 200 } },
  { "run": { "isInternal": true } }
]
```

Then your condition means “the step’s input must contain all keys from both listed partial objects.” You could combine them as a single structure inside TS or keep them separate. Evaluating is done in Postgres via multiple `@>` calls:

```sql
SELECT payload @> condition_item
FROM jsonb_array_elements(condition) AS condition_item
```

**Characteristics**  
- **Statically typed**: TypeScript can ensure the partial objects only contain valid paths from your input shape.  
- **Extremely simple**: Reuses Postgres’s built-in `@>` for partial matching.  
- **Chaining**: Must pass all partials.  
- **JSON-based**: No custom SQL or DSL.  

**Downsides**  
- This only gives you “containment” checks. More advanced comparisons like numeric ranges or `LIKE` patterns aren’t well supported out of the box.  
- No direct way to handle “not equals” or more sophisticated conditions without reintroducing new fields.  

---

### 4. Evaluate Conditions via JSON Schema (Using `is_jsonb_valid`) 
You can represent certain conditions as a subset of [JSON Schema](https://json-schema.org/) (or a homegrown schema approach). Then store that schema as JSON. A single function in Postgres can validate the “payload” against that schema:

```json
{
  "type": "object",
  "properties": {
    "website": {
      "type": "object",
      "properties": {
        "status": { "enum": [200, 201] }
      },
      "required": ["status"]
    }
  },
  "required": ["website"]
}
```

Then use a Postgres extension or a custom function to do a JSON Schema validation:

```sql
SELECT is_jsonb_valid(payload, condition_schema);
```

**Characteristics**  
- **Statically typed**: You can restrict the JSON Schema to only describe your known shape so it can’t mention nonexistent keys.  
- **Featureful**: JSON Schema has a wide array of constraints (enum, minLength, pattern, etc.).  
- **No manual operator code**: The library handles it.  
- **JSON-based**: The schema is stored as JSON.  

**Downsides**  
- Requires a JSON Schema validator that runs inside Postgres or as part of your application logic. Specialized operators are needed if you want it fully inside PG.  
- Some performance overhead for complex schemas.  

---

### 5. Combine Paths + Operator + Value, Using Runtime “SQL Expression” Generation WITHOUT Exposing SQL
Use a TS type that enforces a limited set of operators as strings. The condition remains in JSON form:

```ts
type AllowedOperator = '>' | '<' | '=' | 'LIKE';
type ConditionPart = {
  path: string[];  // e.g. ["website", "status"]
  operator: AllowedOperator;
  compareValue: string | number;
};
```

**In JSON**:
```json
{
  "path": ["website", "status"],
  "operator": ">",
  "compareValue": 199
}
```

You can store multiple ConditionParts, interpret them in a single function, and convert them to a safe, typed expression. For example:

```sql
-- Pseudocode
PERFORM safe_evaluate(payload, condition);
```

**Characteristics**  
- **Statically typed**: TS ensures `path` only references known fields, `operator` is in an allowed set, etc.  
- **Single function**: You do not manually code for each operator in the DSL. You do one parse logic in `safe_evaluate(...)`.  
- **No raw SQL strings**: The “operator” is a typed string, not user-supplied free text; you escape or map it carefully so you don’t run insecure dynamic SQL.  
- **JSON-based**: Clear JSON serialization.  

**Downsides**  
- Does require a small “mapping table” from the typed `AllowedOperator` to the actual Postgres operator.  
- Only covers the operators you’ve enumerated; custom logic might require expansions to the typed list.  

---

### 6. Rely on Built-In Comparisons of JSON Path Query with `vars` 
Another variant of the JSONPath idea: `jsonb_path_exists` can be passed external variables. You’d store the JSONPath expression plus a dictionary of variables in your condition. Example:

```json
{
  "expression": "$.website.status ? (@ == $statusVal)",
  "vars": { "statusVal": 200 }
}
```

At runtime:

```sql
SELECT jsonb_path_exists(
  payload,
  condition->>'expression',
  condition->'vars'
);
```

**Characteristics**  
- **Statically typed**: In TS, you can ensure that `vars` align with the expression’s placeholders, tying them to the known step input shape.  
- **Single function**: Again, calls the built-in JSONPath mechanism.  
- **No custom DSL**: The only “DSL” is standard JSONPath strings.  

**Downsides**  
- You still rely on textual quoting inside the JSONPath expression. That can be type-safe in TS if you codify it carefully.  

---

### Balancing Statically Typed Constraints with JSON Storage

All of the above illustrate slightly different ways to store a typed “match rule” in JSON. Whichever approach you choose, the key is to:

1. **Enforce at compile time** (TypeScript) that only valid property paths and operators can appear in the condition object.  
2. **Serialize the condition object as JSON** for storing in the database.  
3. **Use a single “evaluation function” in Postgres** (or the existing built-in JSONPath / partial matching) so you don’t re-implement each operator as a standalone DSL.  

This lets you stay flexible but also safe and maintainable.

---

### Final Thoughts

- **For simple presence checks**: Using partial object matching with `@>` is already a good minimal solution, but it can’t handle numeric comparisons or negations without manual expansions.  
- **For advanced logic**: Harnessing JSONPath (`jsonb_path_exists`) or a small “comparison schema” can yield more expressive power without building a custom DSL.  
- **TypeScript Generics**: You can generate path-literal types from your known input shape, ensuring you never store an invalid path in the condition.  
- **Single Evaluation**: Keep a single place in Postgres that does the real check. This means you don’t have to maintain multiple code paths or define new DSL operators every time.  

These strategies collectively satisfy all the “non-negotiable” points, while allowing you to encode robust dynamic conditions in a typed manner and store them as JSON for runtime.
