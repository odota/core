#!/bin/bash

#Start the external dependencies in separate containers.
sudo docker run -d --name postgres --net=host postgres:9.5
sudo docker run -d --name redis --net=host redis:3
sudo docker run -d --name cassandra --net=host \
    -e "CASSANDRA_LISTEN_ADDRESS=127.0.0.1" \
    -e "MAX_HEAP_SIZE=128M" \
    -e "HEAP_NEWSIZE=24M" \
    cassandra:3

sudo docker run -d --name parser --net=host yasp/parser
#Start a new container running the image, and map your local directory into the container
sudo docker run -v $(pwd):/usr/src/yasp -di --name yasp --net=host yasp/yasp
#Create Postgres DB
sudo docker exec -i postgres psql -U postgres < sql/init.sql
#Create Postgres tables
sudo docker exec -i postgres psql -U postgres yasp < sql/create_tables.sql
#Create Cassandra keyspace
sudo docker exec -i cassandra cqlsh < sql/init.cql
#Create Cassandra tables
sudo docker exec -i cassandra cqlsh -k yasp < sql/create_tables.cql

#Import a Postgres dump:
#sudo docker exec -i postgres pg_restore -d yasp -U postgres --clean < ../dump.pgdump
#Run a script in production:
#sudo docker run -d --name task --restart=always --net=host yasp/yasp:latest sh -c 'curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /usr/src/yasp/.env && node dev/preloader.js'
