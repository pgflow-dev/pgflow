-- Add "calculate_retry_delay" function configuration parameter
ALTER FUNCTION "pgflow"."calculate_retry_delay" SET "search_path" = '';
-- Add "is_valid_slug" function configuration parameter
ALTER FUNCTION "pgflow"."is_valid_slug" SET "search_path" = '';
-- Add "read_with_poll" function configuration parameter
ALTER FUNCTION "pgflow"."read_with_poll" SET "search_path" = '';
