-- Canonical per-step queue-name resolution (#651).
-- TypeScript mirrors this resolver; vectors must stay in sync with
-- pkgs/dsl/__tests__/runtime/step-queues.test.ts.
begin;
select plan(10);

select pgflow_tests.reset_db();

-- Readable name: lowercase flow + '__' + step slug
select is(
  pgflow._resolve_step_queue_name('communityThreadsV1', 'classify', 0),
  'communitythreadsv1__classify',
  'readable name is lower(flow || __ || step)'
);

-- Readable at exactly 47 characters is accepted
select is(
  pgflow._resolve_step_queue_name(rpad('f', 44, 'f'), 's', 10),
  rpad('f', 44, 'f') || '__s',
  '47-character readable name is used'
);

-- Readable too long, actual index fallback fits
select is(
  pgflow._resolve_step_queue_name('shortFlow', rpad('s', 40, 's'), 3),
  'shortflow__3',
  'oversized readable name falls back to the actual zero-based index'
);

-- 44-character flow, index 9: fallback fits (47), readable does not
select is(
  pgflow._resolve_step_queue_name(rpad('f', 44, 'f'), rpad('s', 20, 's'), 9),
  rpad('f', 44, 'f') || '__9',
  '44-char flow uses index fallback when it fits'
);

-- 44-character flow, index 10: readable and fallback both exceed 47
select throws_ok(
  $$ select pgflow._resolve_step_queue_name(rpad('f', 44, 'f'), rpad('s', 20, 's'), 10) $$,
  'Cannot derive a queue for step "' || rpad('s', 20, 's') || '" at index 10 in flow "' || rpad('f', 44, 'f') || '".',
  'step whose readable and fallback names both exceed 47 is rejected'
);

-- 45-character flow: even flow__0 exceeds 47
select throws_ok(
  $$ select pgflow._resolve_step_queue_name(rpad('f', 45, 'f'), 's', 0) $$,
  'Flow "' || rpad('f', 45, 'f') || '" cannot use per-step queues.',
  '45-char flow is rejected because the shortest index suffix exceeds 47'
);

-- Flow failure DETAIL names the shortest required queue and its length
do $$
declare
  v_detail text;
  v_hint text;
begin
  begin
    perform pgflow._resolve_step_queue_name(rpad('f', 45, 'f'), 's', 0);
  exception when others then
    get stacked diagnostics
      v_detail = PG_EXCEPTION_DETAIL,
      v_hint = PG_EXCEPTION_HINT;
  end;
  assert v_detail like '%"' || rpad('f', 45, 'f') || '__0" is 48 characters; PGMQ allows at most 47.%',
    'unexpected DETAIL: ' || v_detail;
  assert v_hint = 'Shorten the concrete flow slug or use the default single queue.',
    'unexpected HINT: ' || v_hint;
end
$$;
select ok(true, 'flow failure carries actionable DETAIL and HINT');

-- Step failure DETAIL reports both candidate lengths and the maximum
do $$
declare
  v_detail text;
  v_hint text;
begin
  begin
    perform pgflow._resolve_step_queue_name(rpad('f', 44, 'f'), rpad('s', 20, 's'), 10);
  exception when others then
    get stacked diagnostics
      v_detail = PG_EXCEPTION_DETAIL,
      v_hint = PG_EXCEPTION_HINT;
  end;
  assert v_detail = 'The readable name is 66 characters and the index fallback is 48; PGMQ allows at most 47.',
    'unexpected DETAIL: ' || v_detail;
  assert v_hint like 'Shorten the concrete flow slug, shorten the step slug%',
    'unexpected HINT: ' || v_hint;
end
$$;
select ok(true, 'step failure carries actionable DETAIL and HINT');

-- Long case-only duplicates must fail before route resolution. Each readable
-- name is 66 characters, while the actual-index fallbacks would be distinct
-- (`flow__0` and `flow__1`) and therefore cannot detect the duplicate.
select throws_ok(
  $$
    select pgflow._derive_queue_routes(
      rpad('f', 44, 'f'),
      jsonb_build_object(
        'steps',
        jsonb_build_array(
          jsonb_build_object('slug', 'A' || rpad('s', 19, 's')),
          jsonb_build_object('slug', 'a' || rpad('s', 19, 's'))
        )
      ),
      'step'
    )
  $$,
  'Steps "A' || rpad('s', 19, 's') || '" and "a' || rpad('s', 19, 's')
    || '" in flow "' || rpad('f', 44, 'f') || '" conflict case-insensitively.',
  'long case-only duplicate slugs are rejected before distinct index fallbacks resolve'
);

-- Names are never truncated: derived length is either <= 47 or rejected
select is(
  length(pgflow._resolve_step_queue_name('shortFlow', rpad('s', 36, 's'), 5)),
  47,
  'a 47-character readable name is returned at full length'
);

select finish();
rollback;
