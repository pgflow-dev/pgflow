1. omg is direct really the best? can you find a better name other than listed ones?

2. is b__gate (taskless) also a ghost?

for the input shape to b__X i think it should not work like this, the whole __prep ghost step is made specifically so
we can "translate the dependsOn inputs into { run: XXX } compatible data structure for the embedded flow root steps"
but if we use the callback version, not the embedded flow version, it should be possible to just:
- completely skip the __prep step, then inner root steps gets: input = { depA, depB } (maybe we should also pass the run, so { depA, depB, run }?? why not?)
- provide the __prep to tailor the input shape to the inner flow input type

i not yet decided on how we should implement this branching prep step tbh, i dont remember why the run was excluded from that input - a branch is kinda like the normal step really, so why it cannot access the original input.run if no __prep was given?

SLUGS ambiguiti:

we definitely need the way to tell that a step is prep/cond/gate and it is impossible to infer it from the slug alone
but at the same time we need to be able to rely on the slug as those ghost steps are regular steps and we dont want to mess with the worker if we dont need to
so we need to both have slug and explicit way of saying gate/cond/prep
give me few ideas how to achieve this


8. im thinking that maybe we should allow some delimiter char into the slug?
i know that there is a check 'is_valid_slug' but the reason i restricted it so much is to be able to always
represent a given slug as a key in typescript array

but if we for example allow color or slash, it is much more readable and removes unambiguity
and as far as i think about this system, there should be no situations in which the full slug with delimiters 
is used as key in the typescript object, because the compiler/dsl will always rewrite and strip the
prefixes and keep only the core slug itself, which we can validate does not contain any delimiters

i also think you are making it super confusing and using prefixes (cond for step is __cond__step) and suffixes (cond for branch onb is onb__cond) - i think it would be easier to use prefixes, as then we can say that any slug starting with __ is a ghost

i do not like the idea of having __prep and __prep_for as it seems confusing
give me some examples of what i just described (the delimiters)
