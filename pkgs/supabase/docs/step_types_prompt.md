cat functions/_pgflow/*.ts functions/_flows/{Inn,Proc,NlpPip}*.sql migrations/*pgflow*.sql tests/*.sql | aichat '

i have an idea for new feature for pgflow - a collection of extensions for Flow DSL, 
adding new methods that are just a syntax sugar or some wrappers that under the hood
uses step() to just add regular steps (can add multiples steps in one call tho).

i accept that for some types of steps we would need to store a "step_type" value in the pgflow.steps and
optionally a task_type value in step_tasks table. also acceptable for me that for some types of steps
we would need to run multiple tasks, for example i imagine a type of task that would be a "for loop" 
or "map" over an input array (enforced via types and maybe how the flow dsl method is structured argument-wise)

i am interested also in the conditional type of task - imagine it can add two steps - a "check condition" step and a regular handler step
and use some metadata in payloads to leverage the condition-step result in postgres functions to decide if we wanna enqueue the task for that step (if it is TRUE).

i think the interesting step type would also be one that simulates how the supabase.insert, supabase.upsert, supabase.rpc works:
we would use the type argument to this new step method and use it to get the type of rpc/row columns, this way we can provide type annotations
and validate the return value based on what the call would expect.
i imagine the syntax would be a declarative version of the supabase rpc runtime call, kinda like "curried function":

const flow = new Flow<string>()
  .supabaseRpc("postgresFunctionName", ({ run }) => {
    return { id: run.id, name: run.name, created_at: (new Date()).toISOString() }
  })

the above code should be a way of specifying arguments for rpc call and is intentionally similar to js sdk of supabase, but it is a declarative spinoff  - 
i mean, pgflow will call "postgresFunctionName" with what the handler function returns, and the return value of the rpc/pg function will be saved as a step_result and used for dependents as an input payload

######## FINAL #######

make sure to assess the viability of those ideas, but try first to understand and refine them to improve them.
feel free to be creative and for each of my ideas create few spinowffs.

output a valid and properly formatted and structured markdown - headers, quotes, syntax highlighted code blocks, bullet points, bolds, proper linking etc.

' --code | tee 
