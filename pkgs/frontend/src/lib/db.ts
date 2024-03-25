import type { Database } from '$backend/types';

export type ChatMessage = Pick<
	Database['public']['Tables']['chat_messages']['Row'],
	'content' | 'role' | 'conversation_id'
>;
