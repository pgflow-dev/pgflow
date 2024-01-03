import { supabase } from './supabaseClient';
import { writable } from 'svelte/store';
import { error } from '@sveltejs/kit';
import type { Writable } from 'svelte/store';
import type { User, SignUpWithPasswordCredentials } from '@supabase/gotrue-js';

const userStore: Writable<User | null> = writable(null);

export async function getUser() {
  const { data: session, error: authError } = await supabase.auth.getUser();

  if (authError || !session) {
    throw error(403, 'Not logged in');
  }

  userStore.set(session.user);
}

export async function signUpUser(credentials: SignUpWithPasswordCredentials) {
  const { data: session, error: authError } = await supabase.auth.signUp(credentials);

  if (authError) {
    throw error(403, authError.message);
  }

  userStore.set(session.user);
}

export async function signInUser(credentials: SignUpWithPasswordCredentials) {
  const { data: session, error: authError } = await supabase.auth.signInWithPassword(credentials);

  if (authError) {
    throw error(403, authError.message);
  }

  userStore.set(session.user);
}

export async function signOutUser() {
  const { error: authError } = await supabase.auth.signOut();

  if (authError) {
    throw error(500, authError.message);
  }

  userStore.set(null);
}
