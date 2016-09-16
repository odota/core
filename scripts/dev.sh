#!/bin/bash

#Start the external dependencies in separate containers.
sudo docker run -d --name postgres --net=host postgres:9.5
sudo docker run -d --name redis --net=host redis:3
sudo docker run -d --name cassandra --net=host \
    -e "CASSANDRA_LISTEN_ADDRESS=127.0.0.1" \
    -e "MAX_HEAP_SIZE=128M" \
    -e "HEAP_NEWSIZE=24M" \
    cassandra:3

sudo docker run -d --name parser --net=host odota/parser
#Start a new container running the image, and map your local directory into the container
sudo docker run -v $(pwd):/usr/src/yasp -di --name yasp --net=host odota/core
#Create Postgres DB
sudo docker exec -i postgres psql -U postgres < sql/init.sql
#Create Postgres tables
sudo docker exec -i postgres psql -U postgres yasp < sql/create_tables.sql
#Create Cassandra keyspace
sudo docker exec -i cassandra cqlsh < sql/init.cql
#Create Cassandra tables
sudo docker exec -i cassandra cqlsh -k yasp < sql/create_tables.cql
