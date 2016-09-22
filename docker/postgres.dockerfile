FROM postgres:9.5

COPY docker/prepend.sh /usr/local/bin/prepend

COPY sql/init.sql /docker-entrypoint-initdb.d/10-init.sql
COPY sql/create_tables.sql /docker-entrypoint-initdb.d/20-create_tables.sql

RUN echo '\\\\c yasp' | bash prepend /docker-entrypoint-initdb.d/20-create_tables.sql
