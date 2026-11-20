#!/bin/bash
sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

sleep 2

sudo mkdir -p /var/lib/postgresql/data
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-postgres-4 /var/lib/postgresql/data
sudo docker run -d --name postgres --restart=always --log-opt max-size=1g -e "PGDATA=/var/lib/postgresql/data/pgdata" -v /var/lib/postgresql/data:/var/lib/postgresql/data --net=host postgres:9.5
sudo docker start postgres

sudo mkdir -p /var/lib/cassandra
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-cassandra-3 /var/lib/cassandra
#-e CASSANDRA_SEEDS=cassandra-1
sudo docker run --name cassandra --restart=always --log-opt max-size=1g -d --net=host -e CASSANDRA_NUM_TOKENS=256 -v /var/lib/cassandra:/var/lib/cassandra cassandra:5
sudo docker start cassandra

sudo mkdir -p /var/lib/clickhouse
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-clickhouse /var/lib/clickhouse
sudo docker run --name clickhouse --restart=always --log-opt max-size=1g -d --net=host -e CLICKHOUSE_SKIP_USER_SETUP=1 -v /var/lib/clickhouse:/var/lib/clickhouse clickhouse/clickhouse-server:26.10
sudo docker start clickhouse

sudo mkdir -p /var/lib/redis
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-redis /var/lib/redis
sudo docker run -d --name redis --restart=always --log-opt max-size=1g --net=host -v /var/lib/redis:/data redis:7 /usr/local/bin/redis-server
sudo docker start redis

sudo docker run -d --name backend --restart=always --net=host --log-opt max-size=1g -e PROVIDER=gce -e GROUP=backend -e FRONTEND_PORT=80 odota/core:latest sh -c "npm start"
sudo docker start backend