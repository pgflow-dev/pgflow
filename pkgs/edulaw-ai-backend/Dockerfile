# Stage 1: Builder
FROM python:3.11-slim AS builder

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml pdm.lock ./
RUN pip install -U pdm
RUN mkdir -p __pypackages__
RUN pdm install --no-editable --no-self --prod


# Stage 2: Runtime
FROM python:3.11-slim

ENV APP_DIR /app
WORKDIR $APP_DIR

ENV PYPACKAGES="${APP_DIR}/__pypackages__"
ENV PATH="${PATH}:${PYPACKAGES}/3.11/bin"
ENV PYTHONPATH="${APP_DIR}/pkgs"


COPY --from=builder /app/__pypackages__/3.11/lib $PYTHONPATH/
COPY ./ /${APP_DIR}/

EXPOSE 8080
CMD ["python", "-m", "uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8080"]
