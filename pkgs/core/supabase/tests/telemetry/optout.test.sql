-- Corrections 3+4: disable() must prove actual cross-owner absence through
-- a narrowly privileged check of cron.job before it reports success, and
-- that check must fail closed when its own definer cannot prove global
-- visibility. cron.job row security (username = CURRENT_USER) hides a job
-- scheduled by another role, and cron.unschedule reports an absent job and
-- a foreign-owned job identically ("could not find valid entry").
-- SECURITY DEFINER alone does not bypass row security: a definer that is
-- neither superuser nor BYPASSRLS nor a cron.job owner still sees only its
-- own rows, so a visibility-limited query proves nothing and the helper
-- must refuse to answer instead of guessing. pgflow_telemetry.job_registry
-- cannot close that gap alone: a manually scheduled job never gets a row,
-- and an externally unscheduled job leaves a stale one.
begin;
select plan(27);

select pgflow_tests.reset_db();

-- The privileged check is the security boundary: it must run as its
-- definer (the installer role, which can see cron.job across owners), take
-- no arguments (the job name is fixed: one bit of output, no general cron
-- data), and pin an empty search_path so nothing can shadow cron.job.
select is(
  (
    select p.pronargs = 0 and p.prorettype = 'boolean'::regtype
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgflow_telemetry'
      and p.proname = 'job_is_scheduled'
  ),
  true,
  'privileged check takes no arguments and returns only a boolean'
);

select ok(
  (
    select p.prosecdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgflow_telemetry'
      and p.proname = 'job_is_scheduled'
  ),
  'privileged check runs as its definer, so it sees jobs across owners'
);

select ok(
  (
    select p.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgflow_telemetry'
      and p.proname = 'job_is_scheduled'
  ),
  'privileged check pins an empty search_path (no object shadowing)'
);

-- Scenario A: a real cron job scheduled manually (or by another role)
-- carries no registry row. A caller who cannot even see the job through
-- cron.job row security must not be told the opt-out worked.
select cron.unschedule('pgflow_telemetry_report');
delete from pgflow_telemetry.job_registry;

-- Simulate a DBA scheduling telemetry by hand: real job, no registry row.
select cron.schedule(
  'pgflow_telemetry_report',
  '17 3 * * *',
  'select 1'
);

select is(
  (select count(*) from pgflow_telemetry.job_registry),
  0::bigint,
  'scenario A precondition: a real job exists with zero registry rows'
);

grant usage on schema pgflow_telemetry to authenticated;
grant select on pgflow_telemetry.job_registry to authenticated;
grant execute on function pgflow_telemetry.disable() to authenticated;
grant usage on schema cron to authenticated;
grant execute on function cron.unschedule(text) to authenticated;
set local role authenticated;

select throws_like(
  $$select pgflow_telemetry.disable()$$,
  '%stays ENABLED%',
  'RLS-hidden job without registry row: disable() fails closed'
);

reset role;

select ok(
  exists (select 1 from cron.job where jobname = 'pgflow_telemetry_report'),
  'RLS-hidden job without registry row: the job itself is untouched'
);

select is(
  (select count(*) from pgflow_telemetry.job_registry),
  0::bigint,
  'RLS-hidden job without registry row: registry stays empty'
);

-- Scenario B: a job unscheduled externally (the DBA ran cron.unschedule
-- directly instead of pgflow_telemetry.disable()) leaves a stale registry
-- row. disable() must prove absence, reconcile the stale row, and succeed
-- idempotently.
select cron.unschedule('pgflow_telemetry_report');
insert into pgflow_telemetry.job_registry (jobname, jobid)
values ('pgflow_telemetry_report', 999999);

select ok(
  not exists (select 1 from cron.job where jobname = 'pgflow_telemetry_report'),
  'scenario B precondition: no real job, stale registry row present'
);

select lives_ok(
  $$select pgflow_telemetry.disable()$$,
  'stale registry row: disable() succeeds after proving absence'
);

select is(
  (select count(*) from pgflow_telemetry.job_registry),
  0::bigint,
  'stale registry row: successful disable reconciles the registry'
);

select lives_ok(
  $$select pgflow_telemetry.disable()$$,
  'absent job: disable() stays idempotent'
);

-- Registry row plus a foreign-owned job (correction 2 case, kept): the
-- caller that cannot remove the job must still fail closed.
select pgflow_telemetry.enable();

set local role authenticated;

select throws_like(
  $$select pgflow_telemetry.disable()$$,
  '%stays ENABLED%',
  'registry row with RLS-hidden job: disable() fails closed'
);

reset role;

select ok(
  exists (select 1 from cron.job where jobname = 'pgflow_telemetry_report'),
  'registry row with RLS-hidden job: the job is untouched'
);

select is(
  (select count(*) from pgflow_telemetry.job_registry),
  1::bigint,
  'registry row with RLS-hidden job: the registry row is untouched'
);

-- Scenario D (correction 4): fail closed when the helper's definer cannot
-- prove global visibility. With the helper owned by a non-superuser,
-- non-BYPASSRLS, non-cron-job-owner role, SECURITY DEFINER still leaves
-- cron.job row security filtering the existence query, so "no rows found"
-- cannot distinguish an absent job from a foreign-owned one. disable()
-- must fail visibly instead of reporting false success while the job stays
-- scheduled, enable() must fail through the same proof, and the fix the
-- error prescribes (reassign the helper to a capable owner) must restore
-- the normal opt-out path.
select cron.unschedule('pgflow_telemetry_report');
delete from pgflow_telemetry.job_registry;

create role telemetry_blind login;
-- ALTER FUNCTION ... OWNER TO needs SET on the target role. The literal
-- harness role name is deliberate: GRANT ... TO CURRENT_USER WITH SET
-- segfaults this PostgreSQL build (verified 17.x local stack), while
-- CURRENT_USER stays valid everywhere else.
grant telemetry_blind to postgres with set true;
grant usage, create on schema pgflow_telemetry to telemetry_blind;
-- cron schema usage mirrors scenario A: without it the definer fails on
-- schema resolution (a visible permission error) instead of reproducing
-- the visibility-limited false-absence this scenario is about.
grant usage on schema cron to telemetry_blind;

select cron.schedule('pgflow_telemetry_report', '17 3 * * *', 'select 1');
alter function pgflow_telemetry.job_is_scheduled() owner to telemetry_blind;

select is(
  (
    select r.rolsuper or r.rolbypassrls
    from pg_catalog.pg_roles r
    where r.rolname = 'telemetry_blind'
  ),
  false,
  'scenario D precondition: helper owner is neither superuser nor BYPASSRLS'
);

select is(
  (
    select pg_catalog.pg_has_role('telemetry_blind', c.relowner, 'member')
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'cron' and c.relname = 'job'
  ),
  false,
  'scenario D precondition: helper owner is not a member of the cron.job owner'
);

select is(
  (select count(*) from cron.job where jobname = 'pgflow_telemetry_report'),
  1::bigint,
  'scenario D precondition: one foreign-owned telemetry job exists'
);

select throws_like(
  $$select pgflow_telemetry.disable()$$,
  '%cannot prove the telemetry job absent%',
  'non-capable helper owner with foreign job: disable() fails visibly instead of false success'
);

select ok(
  exists (select 1 from cron.job where jobname = 'pgflow_telemetry_report'),
  'non-capable helper owner with foreign job: the job stays scheduled'
);

select is(
  (select count(*) from pgflow_telemetry.job_registry),
  0::bigint,
  'non-capable helper owner: the registry stays empty'
);

select throws_like(
  $$select pgflow_telemetry.enable()$$,
  '%cannot prove the telemetry job absent%',
  'non-capable helper owner: enable() fails closed through the same proof'
);

-- The prescribed fix: reassign the helper to a capable owner. The normal
-- opt-out path must work again immediately afterwards.
alter function pgflow_telemetry.job_is_scheduled() owner to current_user;

select lives_ok(
  $$select pgflow_telemetry.disable()$$,
  'capable helper owner restored: disable() proves absence and succeeds'
);

select ok(
  not exists (select 1 from cron.job where jobname = 'pgflow_telemetry_report'),
  'capable helper owner restored: the job is gone after disable()'
);

-- Scenario E (correction 5): membership without inheritance must not
-- count as capability. A NOINHERIT member of the cron.job owner passes
-- pg_has_role(..., 'member') but its owner privileges stay dormant, so
-- cron.job row security would still filter the existence query and the
-- helper would report a false absence. The capability proof must require
-- 'usage'. This stack reserves granting membership in the real cron.job
-- owner (supabase_admin) to superusers, so the owner-transfer live probe
-- is impossible here; the dormant-membership state is reproduced with a
-- controlled role pair and the installed proof is pinned to 'usage'.
create role telemetry_e_owner login;
create role telemetry_noinherit noinherit login;
grant telemetry_e_owner to telemetry_noinherit;

select is(
  pg_catalog.pg_has_role('telemetry_noinherit', 'telemetry_e_owner', 'member'),
  true,
  'scenario E: a NOINHERIT member still passes the member check'
);

select is(
  pg_catalog.pg_has_role('telemetry_noinherit', 'telemetry_e_owner', 'usage'),
  false,
  'scenario E: a NOINHERIT member has no usable privileges (usage is false)'
);

select ok(
  (
    select pg_catalog.strpos(
      p.prosrc,
      'pg_has_role(current_user, c.relowner, ''usage'')'
    ) > 0
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgflow_telemetry' and p.proname = 'job_is_scheduled'
  ),
  'capability proof requires inherited privileges (pg_has_role usage)'
);

select ok(
  (
    select p.prosrc !~ 'pg_has_role\(current_user, c\.relowner, ''member''\)'
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgflow_telemetry' and p.proname = 'job_is_scheduled'
  ),
  'capability proof never accepts dormant membership (no member check)'
);

select finish();
rollback;
