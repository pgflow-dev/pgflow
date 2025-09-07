1) 'completion_channel' is too similar to 'realtime_channel' which we will be having on runs to tell the name of websocket channel, give 10 dofferent suggestions

2) i definitely want option D it is great

3) agree with everything!

5) seems reasonable, maybe 'preparation_failed' would be tied to this generic 'single ghost step doing preprocessing' in .branch() and .fanout()? if those cannot be both at the same time, maybe generic 'preprocessing_failure' be enough?

7) what if output handler runs before some leaf handler completes? the flow output will be available before the run is completed...
   im not sure if it is a good idea to even allow for output step to not depend on all the leaf steps

8) why you think it is UI metadata? explain it to me with examples

9) what i had on mind is to have this notion of a 'single ghost step doing preprocessing for actual normal step' encoded in generic way in the sql core functions, and .branch() and .fanout() just using this, one for 'input' and other for 'array'
would that pattern be useful somewhere else? 
