#!/bin/bash

sudo service postgresql stop
sudo docker run -d --privileged --name cassandra --net=host \
    -e "CASSANDRA_LISTEN_ADDRESS=127.0.0.1" \
    -e "MAX_HEAP_SIZE=128M" \
    -e "HEAP_NEWSIZE=24M" \
    cassandra:3
sudo docker run -d --privileged --name postgres --net=host postgres:9.5
sudo docker run -d --privileged --name redis --net=host redis:3
sudo docker run -d --name parser --net=host yasp/parser
sudo docker pull yasp/yasp && sudo docker build -t "yasp/yasp" .
