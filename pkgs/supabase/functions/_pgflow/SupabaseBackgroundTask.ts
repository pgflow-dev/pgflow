export default class SupabaseBackgroundTask extends Event {
  readonly taskPromise: Promise<Response>;

  constructor(taskPromise: Promise<Response>) {
    super("pgflow");
    this.taskPromise = taskPromise;
  }
}
globalThis.addEventListener("myBackgroundTask", async (event) => {
  const res = await (event as MyBackgroundTaskEvent).taskPromise;
  console.log(await res.json());
});
