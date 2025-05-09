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
  # image = "postgres:15"
  # custom image is built and pushed to speed up schema verification,
  # otherwise it takes around 30s
  image = "jumski/postgres-15-pgmq:latest"
  baseline = file("schema.sql")
  build {
    dockerfile = "atlas/Dockerfile"
    context = "."
  }
}
