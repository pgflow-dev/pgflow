import { type Database } from '$lib/db';

export type Message = Database['chat']['Tables']['messages']['Row'];
export type Conversation = Database['chat']['Tables']['conversations']['Row'];
