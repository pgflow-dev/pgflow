import { init, track as trackEvent } from '@plausible-analytics/tracker';
import { browser } from '$app/environment';

interface PlausibleConfig {
	domain: string;
	apiHost?: string;
	trackLocalhost?: boolean;
}

let initialized = false;

/**
 * Initialize Plausible analytics tracking.
 * Should be called once when the app loads.
 *
 * @param config - Configuration options for Plausible
 * @param config.domain - Your site's domain (e.g., 'demo.pgflow.dev')
 * @param config.apiHost - Optional custom API endpoint (for proxy setup)
 * @param config.trackLocalhost - Whether to track events on localhost (default: false)
 */
export function initPlausible(config: PlausibleConfig): void {
	// Only run in browser environment
	if (!browser) {
		return;
	}

	// Prevent double initialization
	if (initialized) {
		console.warn('[Plausible] Already initialized');
		return;
	}

	const { domain, apiHost, trackLocalhost = false } = config;

	try {
		init({
			domain,
			// If apiHost is provided, use it as the endpoint
			...(apiHost && { endpoint: `${apiHost}/event` }),
			// Disable tracking on localhost unless explicitly enabled
			captureOnLocalhost: trackLocalhost,
			// Auto-capture pageviews
			autoCapturePageviews: true,
			// Track file downloads
			fileDownloads: true,
			// Track outbound links
			outboundLinks: true
		});

		initialized = true;
		console.log('[Plausible] Initialized successfully');
	} catch (error) {
		console.error('[Plausible] Initialization failed:', error);
	}
}

/**
 * Track a custom event in Plausible.
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
	if (!browser) {
		return;
	}

	if (!initialized) {
		console.warn('[Plausible] Not initialized. Call initPlausible() first.');
		return;
	}

	try {
		trackEvent(eventName, {
			...(props && { props }),
			...(revenue && { revenue })
		});
	} catch (error) {
		console.error(`[Plausible] Failed to track event "${eventName}":`, error);
	}
}
