export const TAGLINES = [
	'Your second brain on autopilot',
	'No thinking, just linking',
	'Forget effort, remember content',
	'Lazy storage, smart retrieval',
	'Forget tagging, remember living',
	'Lazy hoarding, smart exploring',
	'Effortless hoarding for digital pack-rats',
	'Lazy now, brilliant later',
	'Brainless bookmarking at its finest',
	'No tags, no problem',
	'Save first, ask questions later',
	'Brainless bookmarking for busy minds',
	'Busy brain? Save the strain'
];

export function randomTagline() {
	return TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
}
