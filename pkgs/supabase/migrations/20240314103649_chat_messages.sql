
create table public.chat_messages (
  id uuid primary key,
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on update cascade on delete cascade,
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

