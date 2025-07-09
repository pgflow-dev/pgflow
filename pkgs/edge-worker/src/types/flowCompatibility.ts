import type { AnyFlow, ExtractFlowContext } from '@pgflow/dsl';
import type { AvailableResources } from './currentPlatform.js';

/**
 * Type guard that ensures a flow's context requirements can be satisfied
 * by the resources provided by the platform (and later custom resources)
 * 
 * A flow is compatible if its accumulated context is assignable to
 * the resources we can provide
 * 
 * For MVP: Only checks against platform resources (no custom resources)
 * Future: Will also check against user-provided custom resources
 */
export type CompatibleFlow<
  F extends AnyFlow,
  Custom extends object = {}
> = ExtractFlowContext<F> extends (AvailableResources & Custom) ? F : never;