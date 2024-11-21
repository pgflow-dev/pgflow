select pgflow.run_flow('ProcessVoiceMemo', jsonb_build_object(
  'objectId', o.id,
	'objectName', o.name,
	'bucketId', o.bucket_id,
	'ownerId', o.owner
))
from storage.objects as o
where bucket_id = 'feed_recordings'
limit 1;
