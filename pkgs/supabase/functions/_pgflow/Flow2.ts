// import { Flow } from "./Flow";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Slug = string;

type Task<
  Input extends Json = Json,
  Output extends Json = Json,
  DepSlugs extends Slug[] = Slug[],
> = {
  slug: Slug;
  deps: DepSlugs;
  handler: (payload: Input) => Output | Promise<Output>;
};

class Flow2<RunPayload extends Json> {
  private tasks: Task[] = [];

  constructor(tasks: Task[] = []) {
    this.tasks = tasks;
  }

  task<Name extends string, RetType extends Json>(
    name: Name,
    handler: (payload: { run: RunPayload }) => RetType | Promise<RetType>,
  ): Flow2<RunPayload>;
}

// const flow = new Flow2<{ value: number }>()
//   .task("start", ({ run: { value } }) => value + 1)
//   .task("end", ["start"], ({ start }) => start * 2);
