-- Create "is_local" function
CREATE FUNCTION "pgflow"."is_local" () RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE SET "search_path" = '' AS $$
select coalesce(
    current_setting('app.settings.jwt_secret', true)
      = 'super-secret-jwt-token-with-at-least-32-characters-long',
    false
  )
$$;
