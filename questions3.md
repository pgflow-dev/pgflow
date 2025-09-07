1) i would not resuse execution_type in both places, maybe work_type for steps and execution_type for tasks? or similar

2) yes it seems about ok, but maybe if we have `context.rawMessage` we can also have `context.rawRun` ? or context.run is better?

the fanoutFrom idea is strange - why define the prepare step slug ? why not just __prepare__process or similar? i do not like this idea tbh
what is your suggestion?

3) i like that
show example usage of this appendFanoutTask - it should involve the flow object somehow, to get the step definition or juyst point at one and get internally
never use enum, use just constraint to narrow list of possible values
i like seed vs appended distinction, IMPORTANT

can this lead to interesting problems but also interesint use cases? i imagine a task handler could call append so one task can spawn another etc, how users can use it? would it be useful?

5) yeah we definitely need failure reason, but not enum - use string + constraint for allowed values
when we want to have only reason on task versus on both step state and step task?

6) yeah so it still benefits from clear design and distinction between the dag concerns (step states) and execution concerns (step tasks)

7) worth to have both? how to start with one and only later add the other without a big hassle?

8) perfect, should we keep those columns on the same table or maybe, if it is UI-related, we should keep them in a separate table that maps 1:1 with the flow shapes - good idea or not? complicated? unnecessary? (we are mvp, we need strong good enough things)

9) i need to choose one for the initial version, but in such a way that it will be completely open and ready to support the second idea later when we needed, your job is to help me decide which i should choose as first implementation, based on predicted use cases for the .branch() feature

10) yes

13) does it makes sense and is valid approach? isnt it confusing?

14) yes exactly

15) yes agree, but we need to coordinate this with 9) and decide for initial version with ability to expand with the second idea later - help me choose which we start with, we need to focus on simplicity and being able to support it later on (i'm not sure when i will implement the explicit .output() if it is possible to postpone it i would postpone it if it does not harm other stuf)

16-18) yes agree with everything

last one)

should we expose the execution_type on the flow level option, as a default for whole flow? do you imagine multi step flows where there is not a single queued step, all running from manual completions? give example to convince me
