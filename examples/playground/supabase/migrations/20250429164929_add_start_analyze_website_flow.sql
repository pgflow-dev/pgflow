-- Create a secure wrapper function for pgflow.start_flow
-- This is a security definer function that will run with the privileges of the creator
-- rather than the caller, allowing it to call pgflow.start_flow even if direct access is blocked
create or replace function public.start_analyze_website_flow(url text)
returns pgflow.runs
language plpgsql
security definer -- Run as the function creator (superuser)
set search_path = public, pgflow -- Restrict search path for security
as $$
DECLARE
  result_run pgflow.runs;
BEGIN
  -- Check if user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to start a flow';
  END IF;

  -- Call pgflow.start_flow as the function owner and get a single run record
  SELECT *
  INTO result_run
  FROM pgflow.start_flow(
    'analyze_website',
    jsonb_build_object(
      'url', url,
      'user_id', auth.uid()
    )
  ) LIMIT 1;

  -- Return the single run record
  RETURN result_run;
END;
$$;

-- Grant execute permission on the wrapper function to authenticated users
grant execute on function public.start_analyze_website_flow(text) to authenticated;
