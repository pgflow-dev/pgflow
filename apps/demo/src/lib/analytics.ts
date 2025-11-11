import { browser } from '$app/environment';

/**
 * Plausible Analytics event options
 */
interface PlausibleOptions {
	props?: Record<string, string | number | boolean>;
	revenue?: { amount: number; currency: string };
	callback?: (result?: { status?: number; error?: Error }) => void;
}

/**
 * TypeScript declaration for the global Plausible function
 * This function is made available by the Plausible script tag
 */
declare global {
	interface Window {
		plausible?: (eventName: string, options?: PlausibleOptions) => void;
	}
}

/**
 * Track a custom event in Plausible Analytics.
 *
 * Note: Plausible must be loaded via script tag for this to work.
 * The script tag is added in +layout.svelte.
 *
 * @param eventName - Name of the event to track
 * @param props - Optional properties to attach to the event
 * @param revenue - Optional revenue tracking data
 *
 * @example
 * ```ts
 * // Simple event
 * track('signup');
 *
 * // Event with properties
 * track('signup', { tier: 'pro', plan: 'monthly' });
 *
 * // Event with revenue
 * track('purchase', { product: 'pro-plan' }, { amount: 29.99, currency: 'USD' });
 * ```
 */
export function track(
	eventName: string,
	props?: Record<string, string | number | boolean>,
	revenue?: { amount: number; currency: string }
): void {
	// Only run in browser environment
	if (!browser) {
		return;
	}

	// Check if Plausible is loaded
	if (!window.plausible) {
		console.warn(
			'[Plausible] Script not loaded. Make sure the Plausible script tag is included in your HTML.'
		);
		return;
	}

	try {
		window.plausible(eventName, {
			...(props && { props }),
			...(revenue && { revenue })
		});
	} catch (error) {
		console.error(`[Plausible] Failed to track event "${eventName}":`, error);
	}
}
