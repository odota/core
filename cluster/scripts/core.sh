#!/bin/bash
#pull configs
rm -rf yasp
git clone https://github.com/yasp-dota/yasp

sudo mkdir -p /var/lib/redis
sudo mount -o discard,defaults /dev/sdb /var/lib/redis
sudo mkdir -p /var/lib/postgresql/data
sudo mount -o discard,defaults /dev/sdc /var/lib/postgresql/data
sudo echo never > /sys/kernel/mm/transparent_hugepage/enabled

sudo docker run -d --name postgres --restart=always -u postgres -e "PGDATA=/var/lib/postgresql/data/pgdata" -v /var/lib/postgresql/data:/var/lib/postgresql/data -v /yasp/cluster/setup/pg_hba.conf:/etc/postgresql/pg_hba.conf -v /yasp/cluster/setup/postgresql.conf:/etc/postgresql/postgresql.conf --net=host postgres:9.5 -- postgres --config_file=/etc/postgresql/postgresql.conf
sudo docker run -d --name redis --restart=always -v /yasp/cluster/setup/redis.conf:/etc/redis/redis.conf -v /var/lib/redis:/var/lib/redis/ --net=host redis:3 -- redis-server /etc/redis/redis.conf
sudo docker run -d --name cassandra --restart=always --net=host cassandra:3

sudo docker start postgres
sudo docker start redis
sudo docker start cassandra

sudo docker pull yasp/yasp:latest
sudo docker rm -fv yasp
sudo docker run -d --name yasp --restart=always --net=host yasp/yasp:latest "node deploy.js core"