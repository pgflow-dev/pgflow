import { Database } from "../../types.d";
import { Flow, type Json } from "./Flow";

type FlowRow = Database["pgflow"]["Tables"]["flows"]["Row"];
type StepRow = Database["pgflow"]["Tables"]["steps"]["Row"];

export default function flowToRows<
  RunPayload extends Json,
  Steps extends Record<string, Json> = Record<never, never>,
>(
  flowSlug: string,
  flow: Flow<RunPayload, Steps>,
): { flowRow: FlowRow; stepRows: StepRow[] } {
  return {
    flowRow: { flow_slug: flowSlug },
    stepRows: Object.entries(flow.getSteps()).map(([stepSlug, _]) => {
      return { flow_slug: flowSlug, step_slug: stepSlug };
    }),
  };
}
