# educational-law-qa

## Installation and running

Make sure to copy `.env.example` to `.env` and customize env vars properly

### via PDM

1. Install the [PDM](https://pdm-project.org/) package manager if you haven a
1. Install dependencies with `pdm sync`
1. Run with `pdm run langchain serve --port 8080`

### via Docker

1. Make sure you have Docker and Docker Compose installed and ready to go
1. Build image with `docker compose build`
1. Run with `docker compose up --abort-on-container-exit`
