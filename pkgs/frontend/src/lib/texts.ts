export const TAGLINES = [
	'Effortless hoarding for digital pack-rats',
	'No thinking, just linking',
	'Your second brain on autopilot',
	'Brainless bookmarking for busy minds',
	'Lazy now, brilliant later',
	'Save now, ask questions later',
	'Forget tagging, remember living',
	'Digital Clutter, Simplified'
];

export function randomTagline() {
	return TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
}
