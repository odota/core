FROM scylladb/scylla
# Note: CI doesn't seem to work with 4 for some reason

COPY wrapper.sh /wrapper.sh
RUN mkdir /docker-entrypoint-init.d
COPY sql/init.cql /docker-entrypoint-init.d/10-init.cql
COPY sql/create_tables.cql /docker-entrypoint-init.d/20-create-tables.cql

ENTRYPOINT ["/wrapper.sh"]