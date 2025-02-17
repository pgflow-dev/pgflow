-- select * from pgmq.create('max_concurrency');
-- select * from pgmq.drop_queue('max_concurrency');
WITH 
params AS (
  SELECT 
    2000000 as msg_count,
    1000 as batch_size
),
batch_nums AS (
  SELECT generate_series(0, msg_count/batch_size - 1) as batch_num
  FROM params
),
batch_ranges AS (
  SELECT 
    batch_num,
    batch_num * batch_size + 1 as start_id,
    (batch_num + 1) * batch_size as end_id
  FROM batch_nums
  CROSS JOIN params
),
batches AS (
  SELECT 
    batch_num,
    array_agg(jsonb_build_object('id', i)) as msg_array
  FROM batch_ranges,
       generate_series(start_id, end_id) i
  GROUP BY batch_num
)
SELECT pgmq.send_batch('max_concurrency', msg_array)
FROM batches
ORDER BY batch_num;

