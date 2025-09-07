1. if i fold json condition into __prep and json condition says the step should be skipped, then the __prep step will not run at all (no tasks to run)

good point with inline branches not needing __prep, but maybe then we can have the taskless __prep?

2. i think there should be also one more rule - the ghost prefix should be only at the inner most segment, never on the other, if it would be on the non-innermost, it would mean then it is treated like branchSlug

:: can separate also mutliple branches if branches are nested
if branchB is nested under branchA, then:

__gate_branchA - decides if branchA will even be run
branchA::__gate__branchB - decides if branchB be run
branchA::__cond__branchB - depends on branchA::__gate__branchB and will run if it is not skipped
branchA::__prep__branchB - depends on branchA::__cond__branchB and will run if it is not skipped
branchA::branchB::__prep__stepA - depends on branchA::__prep__branchB and will run if it is not skipped
branchA::branchB::stepA - depends on branchA::branchB::__prep__stepA and will run if it is not skipped

does it make sense?

STOP USING ANYTHING OTHER IN ANY OTHER EXAMPLES!!!

branchA/gate:branchB - decides if branchB be run
branchA/cond:branchB - depends on branchA/gate:branchB and will run if it is not skipped
branchA/prep:branchB - depends on branchA/cond:branchB and will run if it is not skipped
branchA/branchB/prep:stepA - depends on branchA/prep:branchB and will run if it is not skipped
branchA/branchB/stepA - depends on branchA/branchB/prep:stepA and will run if it is not skipped
