-- select count(*) from pgmq.a_max_concurrency;
-- select read_ct, count(*) from pgmq.q_max_concurrency group by read_ct;
select read_ct - 1 as retries_count, count(*) 
from pgmq.a_max_concurrency group by read_ct order by read_ct;

select * from pgmq.metrics('max_concurrency');

select * from pgmq.a_max_concurrency limit 10;
select EXTRACT(EPOCH FROM (max(archived_at) - min(enqueued_at))) as total_seconds from pgmq.a_max_concurrency;

-- Processing time ranges per read_ct
SELECT 
    read_ct,
    COUNT(*) as messages,
    round(avg(EXTRACT(EPOCH FROM (archived_at - enqueued_at))), 2) as avg_s,
    round(min(EXTRACT(EPOCH FROM (archived_at - enqueued_at))), 2) as min_s,
    round(max(EXTRACT(EPOCH FROM (archived_at - enqueued_at))), 2) as max_s
FROM pgmq.a_max_concurrency 
GROUP BY read_ct 
ORDER BY read_ct;

-- Total processing time for messages with read_ct 1 or 2
SELECT 
    round(sum(EXTRACT(EPOCH FROM (archived_at - enqueued_at))), 2) as total_processing_seconds
FROM pgmq.a_max_concurrency 
WHERE read_ct IN (1, 2);

-- Distribution of processing times in configurable intervals
WITH 
interval_conf AS (
    SELECT 1 as interval_seconds
),
processing_times AS (
    SELECT 
        EXTRACT(EPOCH FROM (archived_at - enqueued_at)) as seconds
    FROM pgmq.a_max_concurrency
)
SELECT 
    ((floor(seconds / interval_seconds) * interval_seconds) || '-' || 
     (floor(seconds / interval_seconds) * interval_seconds + interval_seconds) || 's')::text as time_bucket,
    COUNT(*) as message_count,
    round((COUNT(*)::numeric / interval_seconds), 1) as messages_per_second,
    SUM(COUNT(*)) OVER (ORDER BY floor(seconds / interval_seconds)) as total_processed_so_far
FROM processing_times, interval_conf
GROUP BY floor(seconds / interval_seconds), interval_seconds
ORDER BY floor(seconds / interval_seconds);


-- First let's check the raw distribution
WITH processing_times AS (
    SELECT 
        EXTRACT(EPOCH FROM (archived_at - enqueued_at)) as seconds
    FROM pgmq.a_max_concurrency
)
SELECT 
    floor(seconds) as seconds,
    COUNT(*) as message_count
FROM processing_times
WHERE seconds BETWEEN 165 AND 381
GROUP BY floor(seconds)
ORDER BY floor(seconds);


-- Examine messages around the gap
WITH processing_times AS (
    SELECT 
        msg_id,
        enqueued_at,
        archived_at,
        EXTRACT(EPOCH FROM (archived_at - enqueued_at)) as processing_time,
        read_ct
    FROM pgmq.a_max_concurrency
)
SELECT 
    msg_id,
    enqueued_at,
    archived_at,
    round(processing_time::numeric, 2) as processing_seconds,
    read_ct
FROM processing_times
WHERE 
    processing_time BETWEEN 164 AND 380
ORDER BY processing_time;

-- Show processing time distribution by retry count
WITH processing_times AS (
    SELECT 
        EXTRACT(EPOCH FROM (archived_at - enqueued_at)) as processing_time,
        read_ct,
        width_bucket(EXTRACT(EPOCH FROM (archived_at - enqueued_at)), 0, 400, 20) as time_bucket
    FROM pgmq.a_max_concurrency
)
SELECT 
    ((time_bucket - 1) * 20) || '-' || (time_bucket * 20) || 's' as time_range,
    read_ct,
    COUNT(*) as message_count
FROM processing_times
GROUP BY time_bucket, read_ct
ORDER BY time_bucket, read_ct;
