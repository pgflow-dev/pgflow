# Atlas Postgres image with extensions for pgflow
#
# Extension versions aligned with Supabase Postgres 17.6.1.054
# Reference: https://github.com/supabase/postgres/blob/17.6.1.054/Dockerfile-17

FROM postgres:17

# Set environment variables for postgres
ENV POSTGRES_PASSWORD=postgres
ENV POSTGRES_HOST_AUTH_METHOD=trust

# Install build dependencies
RUN apt-get update && \
    apt-get install -y \
    build-essential \
    git \
    postgresql-server-dev-17 \
    libcurl4-openssl-dev \
    libsodium-dev \
    libicu-dev \
    pkg-config

# Clone and install pgmq v1.5.1 (not in Supabase image, pgflow dependency)
RUN mkdir -p /usr/share/postgresql/17/extension && \
    git clone https://github.com/tembo-io/pgmq.git /tmp/pgmq && \
    cd /tmp/pgmq/pgmq-extension && \
    git checkout v1.5.1 && \
    make && \
    cp pgmq.control /usr/share/postgresql/17/extension/ && \
    cp sql/pgmq--*.sql /usr/share/postgresql/17/extension/ && \
    rm -rf /tmp/pgmq

# Install pg_cron v1.6.4 (v1.6.3+ required for PG17 compatibility)
RUN git clone https://github.com/citusdata/pg_cron.git /tmp/pg_cron && \
    cd /tmp/pg_cron && \
    git checkout v1.6.4 && \
    make && \
    make install && \
    rm -rf /tmp/pg_cron

# Install pg_net v0.20.2 (PG17 compatible, requires libcurl)
RUN git clone https://github.com/supabase/pg_net.git /tmp/pg_net && \
    cd /tmp/pg_net && \
    git checkout v0.20.2 && \
    make && \
    make install && \
    rm -rf /tmp/pg_net

# Install pgsodium v3.1.6 (requires libsodium)
RUN git clone https://github.com/michelp/pgsodium.git /tmp/pgsodium && \
    cd /tmp/pgsodium && \
    git checkout v3.1.6 && \
    make && \
    make install && \
    rm -rf /tmp/pgsodium

# Install supabase_vault v0.2.8 (depends on pgsodium)
RUN git clone https://github.com/supabase/vault.git /tmp/vault && \
    cd /tmp/vault && \
    git checkout v0.2.8 && \
    make && \
    make install && \
    rm -rf /tmp/vault

# Clean up build dependencies (keep runtime libs: libcurl4t64, libsodium23, libicu)
RUN apt-get remove -y build-essential git postgresql-server-dev-17 \
    libcurl4-openssl-dev libsodium-dev libicu-dev pkg-config && \
    apt-get autoremove -y && \
    apt-get update && \
    apt-get install -y --no-install-recommends libcurl4t64 libsodium23 && \
    rm -rf /var/lib/apt/lists/*

# Configure shared_preload_libraries for extensions that require it
# pg_cron and pg_net need to be preloaded (pgsodium NOT needed for Atlas dev)
RUN echo "shared_preload_libraries = 'pg_cron,pg_net'" >> /usr/share/postgresql/postgresql.conf.sample

# We need to ensure we don't create any init scripts that will run on startup
# We must also remove any existing init scripts to ensure a clean database for Atlas
RUN rm -rf /docker-entrypoint-initdb.d/*
