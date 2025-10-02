import type { AnyFlow, ExtractFlowContext, ExtractFlowEnv, FlowContext } from '@pgflow/dsl';
import type { CurrentPlatformResources } from './currentPlatform.js';

/**
 * Type guard that ensures a flow's context requirements can be satisfied
 * by the resources provided by the platform (and later custom resources)
 *
 * A flow is compatible if we can provide what the flow needs
 *
 * For MVP: Only checks against platform resources (no custom resources)
 * Future: Will also check against user-provided custom resources
 */
export type CompatibleFlow<
  F extends AnyFlow,
  UserResources extends Record<string, unknown> = Record<string, never>
> =
  // Check if EdgeWorker CAN PROVIDE what the flow needs
  // Extract the env type from the flow and use it for FlowContext
  (FlowContext<ExtractFlowEnv<F>> & CurrentPlatformResources & UserResources) extends ExtractFlowContext<F>
    ? F
    : never;