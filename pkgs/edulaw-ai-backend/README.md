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

### Python tips and tricks

#### Interactive in-place debugging

```python
import code; code.interact(local=dict(globals(), **locals()))
```

### Shell tips and tricks

Split text file evenly to 3 parts, spliting on newlines.

```fish
split -n l/3 --additional-suffix=.txt data/educational-law-2024.txt data/edulaw-2024-third-
```
