select
    pgflow.run_flow('ProcessVoiceMemo', jsonb_build_object(
        'objectId', o.id,
        'objectName', o.name,
        'bucketId', o.bucket_id,
        'ownerId', o.owner
    ))
from storage.objects as o
cross join generate_series(1, 10) as g (i)
where bucket_id = 'feed_recordings';
-- limit 1;

select * from pgflow.step_states where status not in ('completed', 'failed');
