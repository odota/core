FROM daerdemandt/cassandra-init-manual

# Lower cassandra memory limits
ENV MAX_HEAP_SIZE=128M
ENV HEAP_NEWSIZE=24M
ENV CASSANDRA_LISTEN_ADDRESS=127.0.0.1

COPY sql/init.cql /docker-entrypoint-init.d/10-init.cql
COPY sql/create_tables.cql /docker-entrypoint-init.d/20-create-tables.cql

RUN echo 'USE yasp;' | bash prepend /docker-entrypoint-init.d/20-create-tables.cql
