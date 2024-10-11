# feed-processor

## SQL to enqueue a job

```sql
insert into pgqueuer (priority, entrypoint, payload, status)
values (
	0,
	'fetch',
	'{"some": "arbitrary data"}'::bytea,
	'queued'
	);
```

## Decoding to strings in python

```python
job.payload.decode()
```
