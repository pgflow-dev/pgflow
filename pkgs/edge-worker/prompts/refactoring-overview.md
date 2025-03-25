ai -r architect-o1 -f src/ -s modularize-edge-worker --save-session '

I want to refactor this code to leverage dependency injection through constructor arguments.
I would like to NEVER initialize new objects inside their "consumers", but for consumers to
be injected with already initialized objects.

I will need to be able to make several of the objects "swappable":
- MessageExecutor must be extracted to interface so it can be swapped
- ReadWithPollPoller must be extracted to interface so it can be swapped

In order for them to be 'swappable', the rest of the stack must be agnostic and not
aware of their implementation or inner working.

In order to easy initialize the tree of interdependent objects, we would need to create
a `factory` function that will accept same arguments as EdgeWorker.start() for the options etc,
and will initialize all the dependencies in appropriate order, injecting one into the other,
and finally injecting to the Worker.constructor().

It is very important to make Worker class as agnostic as possible.

Worker responsibility:
- calling Lifecycle object to manage its own state
- having a main loop that is started and runs indefinitely
- managing abort signals in the loop and reacting to them with lifecycle events
- logging any errors
- triggering BarchProcessor in each iteration

It should not know anything about what is polled, how it is polled, what happens with messages etc.

The BatchProcessor should be definitely injected into Worker, and its Responsiblities are:
- calling Poller to get new batch of payloads
- calling ExecutionController to start execution of each payload
- error logging, managing abort signals

It should not know anything about how messages are polled or what and how is executed.

Poller instance and ExecutionController instance should be injected into BatchProcessor

Poller responsibility:
- calling some kind of backend (in our case - Queue) to get new batch of messages
- this calling should be configurable, so Poller must accept polling configuration
- it should manage abort signals of course
- it should expose single poll() method that will return a batch of messages

ExecutionController responsibility:
- it is mainly responsible for managing concurrency of executions
- it should expose start(payload) method that will start execution of a payload
- the number of concurrent executions should be configurable and enforced by a promise queue
- the start() should block until there is a free slot in the promise queue
- it should expose awaitCompletion() that will wait until all executions are completed
- it should manage logging and abort signals
- it should ditch batch archiver we dont need it
- it should be configurable with max concurrency limits
- it should NOT be concerned about retry configuration, it should be MessageExecutor responsibility
- it currently instantiates MessageExecutor, but it should be configurable so it can use different executor
So in short it just takes a payload/message, waits for a free exeuction slot then starts execution using Executor that is configurable

MessageExecutor responsibility:
- it is the single unit of logic for processing a message
- it is responsible for calling provided handler function with the provided payload
- it should acknowledge completion or report failure
- it can contain any additional logic that is needed to contain processing of a single message

In current system, MessageExecutor is maintaining retries in case of failure.
In future system, it will only call complete or fail functions via db connection
and retries will be managed in the SQL function. So that's why we need to be able
to swap it for different implementation.

### IMPORTANT

I would like to do the refactoring in small steps, so your job is to do a high level assessment
of what needs to be done, then you need to figure out the order and start with the single
part that you decide is best to start with.

After each step of refactoring, you must keep the system in working state!

'
