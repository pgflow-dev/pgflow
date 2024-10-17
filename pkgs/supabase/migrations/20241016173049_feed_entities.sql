set search_path to feed;

-- class Bookmark(BaseModel):
--     is_bookmark: bool
--     reason: str = ReasonField
--     url: str = Field(..., description="The URL of the bookmarked webpage")
--     title: str = Field(..., description="The title of the bookmarked webpag
--     short_summary: str = ShortSumaryField
--     tags: List[str] = TagsField
create table bookmarks (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references auth.users (id),
    share_id uuid not null references feed.shares (id),
    reason text,
    url text not null,
    title text not null,
    short_summary text not null,
    tags text [] default '{}',
    created_at timestamp not null default current_timestamp,

    type text generated always as ('bookmark') stored not null
);
alter publication supabase_realtime add table feed.bookmarks;
alter table bookmarks enable row level security;
create policy allow_select on bookmarks for select to authenticated
using (owner_id = auth.uid());

-- class CodeSnippet(BaseModel):
--     is_snippet: bool
--     reason: str = ReasonField
--     source: str = Field(..., description="The source code of the snippet")
--     language_code: str = Field(..., description="The programming language
--     description: str = Field(..., description="The description or any lab
--     short_summary: str = ShortSumaryField
--     tags: List[str] = TagsField
create table code_snippets (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references auth.users (id),
    share_id uuid not null references feed.shares (id),
    reason text,
    source text not null,
    language_code text not null,
    description text not null,
    short_summary text not null,
    tags text [] default '{}',
    created_at timestamp not null default current_timestamp,

    type text generated always as ('code_snippet') stored not null
);
alter publication supabase_realtime add table feed.code_snippets;
alter table code_snippets enable row level security;
create policy allow_select on code_snippets for select to authenticated
using (owner_id = auth.uid());

-- class Event(BaseModel):
--     is_event: bool
--     reason: str = ReasonField
--     time: str = Field(..., description="The date and time of the event in IS
--     place: Optional[str] = Field(..., description="The location where the e
--     title: str = Field(..., description="The title or name of the event")
--     description: Optional[str] = Field(..., description="A brief descripti
--     short_summary: str = ShortSumaryField
--     tags: List[str] = TagsField
create table events (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references auth.users (id),
    share_id uuid not null references feed.shares (id),
    reason text,
    time text not null,
    place text,
    title text not null,
    description text,
    short_summary text not null,
    tags text [] default '{}',
    created_at timestamp not null default current_timestamp,

    type text generated always as ('event') stored not null
);
alter publication supabase_realtime add table feed.events;
alter table events enable row level security;
create policy allow_select on events for select to authenticated
using (owner_id = auth.uid());

-- class Todo(BaseModel):
--     is_todo: bool
--     reason: str = ReasonField
--     title: str = Field(..., description="The title or description of the t
--     due_date: Optional[str] = Field(..., description="The due date of the
--     short_summary: str = ShortSumaryField
--     tags: List[str] = TagsField
create table todos (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references auth.users (id),
    share_id uuid not null references feed.shares (id),
    reason text,
    title text not null,
    due_date text,
    short_summary text not null,
    tags text [] default '{}',
    created_at timestamp not null default current_timestamp,

    type text generated always as ('todo') stored not null
);
alter publication supabase_realtime add table feed.todos;
alter table todos enable row level security;
create policy allow_select on todos for select to authenticated
using (owner_id = auth.uid());

-- class Note(BaseModel):
--     is_note: bool
--     reason: str = ReasonField
--     text: str = Field(..., description="The text of the note, journal entry
--     short_summary: str = ShortSumaryField
--     tags: List[str] = TagsField
create table notes (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references auth.users (id),
    share_id uuid not null references feed.shares (id),
    reason text,
    text text not null,
    short_summary text not null,
    tags text [] default '{}',
    created_at timestamp not null default current_timestamp,

    type text generated always as ('note') stored not null
);
alter publication supabase_realtime add table feed.notes;
alter table notes enable row level security;
create policy allow_select on notes for select to authenticated
using (owner_id = auth.uid());
