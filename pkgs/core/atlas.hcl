docker "postgres" "dev" {
  image = "jumski/postgres-15-pgmq:latest"
  baseline = <<SQL
    create schema if not exists "pgmq";
    create extension if not exists "pgmq" schema "pgmq";
  SQL

  # build {
  #   dockerfile = "Dockerfile.atlas"
  #   context = "."
  # }
}

env "local" {
  url = "postgresql://postgres:postgres@127.0.0.1:50422/postgres?sslmode=disable"
  src = "file://supabase/schemas/"
  dev = docker.postgres.dev.url
}
