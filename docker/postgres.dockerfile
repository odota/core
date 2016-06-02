FROM postgres:9.5

COPY sql /tmp/sql
COPY docker/db-init.sh /tmp
WORKDIR /tmp
RUN ./db-init.sh
WORKDIR /
