env "local" {
  // Define the Dev Database used to evaluate the current state
  dev = docker.postgres.pgflow.url

  // Specify the desired schema source
  src = "file://schemas/"

  // Specify the directory to place generated migrations
  migration {
    dir = "file://supabase/migrations"
  }
}

docker "postgres" "pgflow" {
  # image = "postgres:17"
  # custom image is built and pushed to speed up schema verification,
  # otherwise it takes around 30s
  # contains: pgmq, pg_cron, pg_net, pgsodium, supabase_vault
  # tag matches Supabase Postgres version we align extensions with
  image = "jumski/atlas-postgres-pgflow:17.6.1.054"
  baseline = file("supabase-baseline-schema.sql")
  build {
    dockerfile = "atlas/Dockerfile"
    context = "."
  }
}
