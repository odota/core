FROM postgres:9.5

COPY sql /tmp/sql
COPY docker/prepend.sh /usr/local/bin/prepend
RUN cp /tmp/sql/init.sql /docker-entrypoint-initdb.d/10-init.sql ; \
    cp /tmp/sql/create_tables.sql /docker-entrypoint-initdb.d/20-create_tables.sql ; \
    echo '\\\\c yasp' | prepend /docker-entrypoint-initdb.d/20-create_tables.sql
