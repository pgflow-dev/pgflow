/**
 * Global store for triggering pulse dot animations
 * Controls normal pulsing and explosion exit animation
 */

let pulsing = $state(false);
let exploding = $state(false);

export const pulseDots = {
	get pulsing() {
		return pulsing;
	},

	get exploding() {
		return exploding;
	},

	trigger() {
		pulsing = true;
		exploding = false;

		// Pulse normally for 2 seconds (2 complete 1s cycles)
		setTimeout(() => {
			exploding = true;

			// After explosion animation completes (1s), hide completely
			setTimeout(() => {
				pulsing = false;
				exploding = false;
			}, 1000);
		}, 2000);
	},

	dismiss() {
		pulsing = false;
		exploding = false;
	}
};
