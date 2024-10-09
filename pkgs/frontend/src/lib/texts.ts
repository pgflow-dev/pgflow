export const TAGLINES = [
	'Effortless hoarding for digital pack-rats',
	'No thinking, just linking',
	'Your second brain on autopilot',
	'Brainless bookmarking for busy minds',
	'Lazy now, brilliant later',
	'Save now, ask questions later',
	'Forget tagging, remember living',
	'Digital Clutter, Simplified',
	'Leave the sorting to the robots',
	'Because organizing is overrated',
	'Toss it in, let AI begin'
];

export function randomTagline() {
	return TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
}
