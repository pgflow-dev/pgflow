1. yup it all makes sense, but its far into the future. im glad that we explored this and we need to keep it noted down
the only thing im not sure is if 'direct' is the best name, maybe create 20 suggestions, conveying: 
- not a queue
- manual
- direct
- etc

2. im pretty sure the order in table should:

- b__gate (depends on any upstream outer deps)
  - this allows to skip whole branch and all other ghost steps via a JSONB condition
- b__cond (depends on b__gate)
- b__prep (depends on b__cond)
- b__X (depends on b__prep)

this way we can skip fast using JSONB and not run any other steps, then the second typescript condition to fail before the prep, then prep and then roots
but i'm not sure if this is doable and easy to implement???

im wondering, if b__prep returns "{ yolo: true }", how would the input to b__X look like?
i would expect it will be just "{ yolo: true }" ??
and if one wants to embed existing flow, it just must write such a b__prep that it will return { run: { stuff.... } }
compatible with that the flow input for embedded flow expects?

PROBLEM: from what i understand, it is completely impossible to understand `kyc__aml__prep__verify`, how one would know which are branch prefixes and which are special chars? cant tell if it is nested __prep for verify slug, or rather a prep branch and verify slug inside right? all the parts of that path are connected in same way and losing that info. we need some better way, its impossible from sql perspective to distinguish ghost steps and their types

3. yes this makes sens, but 'cancel' should not be any meaningful thing for a task, its just outside thing from user domain, task would be completed, and user will just model his own way of announcing that the task was cancelled by returning some status that he then interprets appropriately

for the field name i agree with your pick - origin in ('array', 'appended')
u sure that it makes sense in english "origin = appended" tho? 

5. agree with the task failure reason, tasks are simple and can just throw or exceed timeout
for the steps:

- skipped (only if skip_mode=fail) --- not sure, should we have failure_reason=skipped and status=failed then?
- remove cancelled its domain action and lets not mention it again as it is confusing
- condition_error --- agree, simple
- preprocessing_error --- agree, either exception or invalid shape in case of fanout
- task_error --- agree, simple
- task_timeout --- agree, simple

agree on both columns
agree on the guard for fanout shape

8. it is hard to tell if onb__verify__prep is brnach onb then inside it branch verify then step prep, branch onb then step verify with its __prep
i mentioned it above but worded it better here - we need to fix this ambiguity somehow, give me some suggestions

MORE:

- caveat - we should model fanout() and step() in such a way that they do not expect the handler in case of default_route=direct (update to the better naming like described)



















