env "local" {
  // Define the Dev Database used to evaluate the current state
  dev = docker.postgres.dev.url

  // Specify the desired schema source
  src = "file://schemas/"

  // Specify the directory to place generated migrations
  migration {
    dir = "file://supabase/migrations"
  }
}

docker "postgres" "dev" {
  image = "jumski/postgres-15-pgmq:latest"
  baseline = file("realtime_schema.sql")
}
