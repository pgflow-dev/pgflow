set search_path to storage;

insert into storage.buckets (id, name, public)
values ('feed_recordings', 'feed_recordings', true)
on conflict do nothing;

alter table storage.objects enable row level security;

create policy allow_select on storage.objects
for select to authenticated
using (
    bucket_id = 'feed_recordings'
    and owner_id = (select auth.uid())::text
);

create policy allow_insert on storage.objects
for insert to authenticated
with check (
    bucket_id = 'feed_recordings'
    and owner_id = (select auth.uid())::text
);

create policy allow_update on storage.objects
for update to authenticated
using (
    bucket_id = 'feed_recordings'
    and owner_id = (select auth.uid())::text
)
with check (
    bucket_id = 'feed_recordings'
    and owner_id = (select auth.uid())::text
);

create policy allow_delete on storage.objects
for delete to authenticated
using (
    bucket_id = 'feed_recordings'
    and owner_id = (select auth.uid())::text
);

create or replace function feed.enqueue_transcribe_job()
returns trigger
as $$
begin
    -- only perform if the bucket matches feed_recordings
    if NEW.bucket_id = 'feed_recordings' then
        PERFORM pgflow.run_flow(
            'ProcessVoiceMemo',
            json_build_object(
                'bucketId', 'feed_recordings',
                'objectId', NEW.id,
                'objectName', NEW.name,
                'ownerId', NEW.owner
            )::jsonb
        );
    end if;

    RETURN NEW;
end;
$$ language plpgsql security definer;

-- Create trigger for mark_share_changed
create or replace trigger enqueue_transcribe_job_trigger after insert
on storage.objects for each row
execute function feed.enqueue_transcribe_job();
