import { writable } from 'svelte/store';
import type { RemoteModelId } from '$lib/remoteRunnables';

export const currentModelId = writable<RemoteModelId>('ChatOpenAI');
