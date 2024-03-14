
-- drop table public.chat_messages;
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at timestamp with time zone not null default now(),
  content text not null,
  role text not null
);

-- alter table public.chat_messages enable row level security;

-- insert policy
-- create policy "Users can create chat messages"
-- on public.chat_messages for insert to authenticated
-- with check (user_id = auth.uid());

-- update policy

