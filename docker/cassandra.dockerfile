FROM cassandra:4

COPY wait-cassandra.sh /
COPY prepend.sh /usr/local/bin/prepend

RUN head --lines=-2 /docker-entrypoint.sh > /docker-entrypoint.tmp; \
    echo '/wait-cassandra.sh &' >> /docker-entrypoint.tmp; \
    tail --lines=2 /docker-entrypoint.sh >> /docker-entrypoint.tmp; \
    mv /docker-entrypoint.tmp /docker-entrypoint.sh; \
    chmod +x /docker-entrypoint.sh; \
    mkdir /docker-entrypoint-init.d

# This is what would go to child images
# However, that fails if user wants to add files via some other means. Hence, it's commented out.
#ONBUILD COPY cassandra-fixtures/* /docker-entrypoint-init.d/

# Lower cassandra memory limits
ENV MAX_HEAP_SIZE=128M
ENV HEAP_NEWSIZE=24M
ENV CASSANDRA_LISTEN_ADDRESS=127.0.0.1

COPY sql/init.cql /docker-entrypoint-init.d/10-init.cql
COPY sql/create_tables.cql /docker-entrypoint-init.d/20-create-tables.cql

RUN echo 'USE yasp;' | bash prepend /docker-entrypoint-init.d/20-create-tables.cql