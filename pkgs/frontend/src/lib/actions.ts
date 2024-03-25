export function scrollToBottom(node?: HTMLElement) {
	if (node) {
		node.scroll({ top: node.scrollHeight, behavior: 'smooth' });
	}
}
