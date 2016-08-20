FROM daerdemandt/cassandra-init-manual

COPY sql /tmp/sql
RUN cp /tmp/sql/init.cql            /docker-entrypoint-init.d/10-init.cql; \
    cp /tmp/sql/create_tables.cql   /docker-entrypoint-init.d/20-create-tables.cql; \
    echo 'USE yasp;' | prepend /docker-entrypoint-init.d/20-create-tables.cql

