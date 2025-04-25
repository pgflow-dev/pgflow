env "local" {
  // Define the Dev Database used to evaluate the current state
  dev = "docker+postgres://jumski/postgres-15-pgmq:latest/postgres"

  // Specify the desired schema source
  src = "file://supabase/schemas/"

  // Specify the directory to place generated migrations
  migration {
    dir = "file://supabase/migrations"
  }
}
