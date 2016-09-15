FROM daerdemandt/cassandra-init-manual

# Lower cassandra memory limits
ENV MAX_HEAP_SIZE=128M
ENV HEAP_NEWSIZE=24M

COPY sql /tmp/sql
RUN cp /tmp/sql/init.cql            /docker-entrypoint-init.d/10-init.cql; \
    cp /tmp/sql/create_tables.cql   /docker-entrypoint-init.d/20-create-tables.cql; \
    echo 'USE yasp;' | prepend /docker-entrypoint-init.d/20-create-tables.cql

