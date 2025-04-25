# Use official PostgreSQL 15
FROM postgres:15

# Set environment variables for postgres
ENV POSTGRES_PASSWORD=postgres
ENV POSTGRES_HOST_AUTH_METHOD=trust

# Install build dependencies
RUN apt-get update && \
    apt-get install -y \
    build-essential \
    git \
    postgresql-server-dev-15

# Clone and install pgmq
RUN mkdir -p /usr/share/postgresql/15/extension && \
    git clone https://github.com/tembo-io/pgmq.git /tmp/pgmq && \
    cd /tmp/pgmq/pgmq-extension && \
    git checkout v1.4.4 && \
    # Copy extension files manually to PostgreSQL 15 extensions directory
    make && \
    cp pgmq.control /usr/share/postgresql/15/extension/ && \
    cp sql/pgmq--*.sql /usr/share/postgresql/15/extension/

# Clean up
RUN apt-get remove -y build-essential git postgresql-server-dev-15 && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* /tmp/pgmq

# We need to ensure we don't create any init scripts that will run on startup
# We must also remove any existing init scripts to ensure a clean database for Atlas
RUN rm -rf /docker-entrypoint-initdb.d/*
