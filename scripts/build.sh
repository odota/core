#!/bin/bash

# Exit on error
set -e

sudo docker-compose up -d
# sudo service postgresql stop
# sudo docker run -d --privileged --name cassandra --net=host -e "CASSANDRA_LISTEN_ADDRESS=127.0.0.1" cassandra:3.5
# sudo docker run -d --privileged --name postgres --net=host postgres:9.5
# sudo docker run -d --privileged --name redis --net=host redis:5
# sudo docker run -d --privileged --name elasticsearch --net=host docker.elastic.co/elasticsearch/elasticsearch:6.2.4
# sudo docker run -d --name parser --net=host odota/parser
# sudo docker build -t "odota/core" . && sudo docker run --net=host -i odota/core sh -c 'npm run test'
sudo docker run --net=host -i odota-core sh -c 'npm run test'
