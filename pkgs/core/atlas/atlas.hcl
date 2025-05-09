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
  image = "postgres:15"
  baseline = file("realtime_schema.sql")
  build {
    dockerfile = "atlas/Dockerfile"
    context = "."
  }
}
