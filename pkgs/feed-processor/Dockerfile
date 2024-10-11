ARG PYTHON_BASE=3.11-slim
# build stage
FROM python:$PYTHON_BASE AS builder

# install PDM
RUN pip install -U pdm
# disable update check
ENV PDM_CHECK_UPDATE=false
# copy files
COPY pyproject.toml pdm.lock README.md /project/
COPY src/ /project/src

# install dependencies and project into the local packages directory
WORKDIR /project
RUN pdm install --check --prod --no-editable

# run stage
FROM python:$PYTHON_BASE

# retrieve packages from build stage
COPY --from=builder /project/.venv/ /project/.venv
ENV PATH="/project/.venv/bin:$PATH"
ENV PYTHONPATH=src
# set command/entrypoint, adapt to fit your needs
COPY src /project/src

WORKDIR /project

ENTRYPOINT ["python", "-m", "pgqueuer"]
CMD ["run", "feed_processor.main"]
