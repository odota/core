FROM scylladb/scylla
# Note: CI doesn't seem to work with 4 for some reason

COPY ./docker/wait-cassandra.sh /
COPY ./docker/prepend.sh /usr/local/bin/prepend

RUN head --lines=-2 /docker-entrypoint.sh > /docker-entrypoint.tmp; \
    echo '/wait-cassandra.sh &' >> /docker-entrypoint.tmp; \
    tail --lines=2 /docker-entrypoint.sh >> /docker-entrypoint.tmp; \
    mv /docker-entrypoint.tmp /docker-entrypoint.sh; \
    chmod +x /docker-entrypoint.sh; \
    mkdir /docker-entrypoint-init.d

# This is what would go to child images
# However, that fails if user wants to add files via some other means. Hence, it's commented out.
#ONBUILD COPY cassandra-fixtures/* /docker-entrypoint-init.d/

COPY sql/init.cql /docker-entrypoint-init.d/10-init.cql
COPY sql/create_tables.cql /docker-entrypoint-init.d/20-create-tables.cql

RUN echo 'USE yasp;' | bash prepend /docker-entrypoint-init.d/20-create-tables.cql