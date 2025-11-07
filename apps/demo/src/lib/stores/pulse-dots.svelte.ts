/**
 * Global store for triggering pulse dot animations
 * Simple trigger/dismiss mechanism - all mounted PulseDot components respond
 */

let pulsing = $state(false);

export const pulseDots = {
	get pulsing() {
		return pulsing;
	},

	trigger() {
		pulsing = true;
		// Auto-dismiss after animation completes (3 seconds)
		setTimeout(() => {
			pulsing = false;
		}, 3000);
	},

	dismiss() {
		pulsing = false;
	}
};
