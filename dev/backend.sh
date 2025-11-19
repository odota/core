#!/bin/bash
sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

sudo mkdir -p /var/lib/redis
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-redis /var/lib/redis
# Disable --restart=always if using stateful boot disk
# Otherwise we may restart before mount and then overwrite saved data with empty
sudo docker run -d --name redis --log-opt max-size=1g --net=host -v /var/lib/redis:/data redis:7 /usr/local/bin/redis-server
sudo docker start redis

sudo mkdir -p /var/lib/postgresql/data
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-postgres-4 /var/lib/postgresql/data
sudo docker run -d --name postgres --log-opt max-size=1g -e "PGDATA=/var/lib/postgresql/data/pgdata" -v /var/lib/postgresql/data:/var/lib/postgresql/data --net=host postgres:9.5
sudo docker start postgres

sudo mkdir -p /var/lib/cassandra
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-cassandra-3 /var/lib/cassandra
#-e CASSANDRA_SEEDS=cassandra-1
sudo docker run --name cassandra --log-opt max-size=1g -d --net=host -e CASSANDRA_NUM_TOKENS=256 -v /var/lib/cassandra:/var/lib/cassandra cassandra:5
sudo docker start cassandra

sudo docker run -d --name parseServer --restart=always --cpus=24 --net=host --log-opt max-size=1g -e SERVICE_REGISTRY_HOST=localhost -e RETRIEVER_SECRET=REPLACE_ME odota/parser
sudo docker start parseServer

sudo docker run -d --name backend --restart=always --net=host --log-opt max-size=1g -e PROVIDER=gce -e GROUP=backend -e FRONTEND_PORT=80 odota/core:latest sh -c "npm start"
sudo docker start backend