ai -f src/ -f ../core/README.md -c '
create FlowCompilator class with `constructor(flow: Flow)`
this class should have one method `compile(): string` that should return 
an sql definition corresponding to the dsl version of a flow, based on how
it is described in the README.md of core project:

it must output a proper sql code with call to create_flow and multiple calls to add_step in the same order as they are added in the flow

make sure function covers happy path and edge cases:

- no provided options at all
- only flow options
- flow options and step options
- no flow options, only step options
- multiple root steps
- invalid, non-existing options (for flow and for step)
- invalid value for option (string or something other than number, for flow and for step)

make it as simple as readable as possible, extract StepCompilator class in the same file to help with compiling respective steps

make sure to use FlowOptions and StepOptions instead of just Record<string, any> for options

output typescript

' | tee src/compile.ts
