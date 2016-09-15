#!/bin/bash

sudo service postgresql stop
sudo docker run -d --privileged --name cassandra --net=host -e "CASSANDRA_LISTEN_ADDRESS=127.0.0.1" cassandra:3
sudo docker run -d --privileged --name postgres --net=host postgres:9.5
sudo docker run -d --privileged --name redis --net=host redis:3
sudo docker run -d --name parser --net=host odota/parser
sudo docker build -t "odota/core" .