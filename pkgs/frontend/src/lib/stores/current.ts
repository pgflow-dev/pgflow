import { type Session, type Subscription, type SupabaseClient } from '@supabase/supabase-js';
import { get, writable, type Writable } from 'svelte/store';

const sessionStore: Writable<Session | null> = writable(null);
const supabaseStore: Writable<SupabaseClient | null> = writable(null);
const authSubscriptionStore = writable<Subscription | null>(null);

export function setCurrentSupabase(client: SupabaseClient) {
	supabaseStore.set(client);

	const previousSubscription = get(authSubscriptionStore);

	if (previousSubscription) {
		previousSubscription.unsubscribe();
	}

	const {
		data: { subscription }
	} = client.auth.onAuthStateChange((_, session) => {
		sessionStore.set(session);
	});

	authSubscriptionStore.set(subscription);
}

export function getCurrentSupabase() {
	return get(supabaseStore);
}

export const supabase = { subscribe: supabaseStore.subscribe };
export const session = { subscribe: sessionStore.subscribe };
