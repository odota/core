#!/bin/bash
sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

sudo mkdir -p /var/lib/redis
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-redis /var/lib/redis
sudo docker run -d --name redis --restart=always --log-opt max-size=1g --net=host -v /var/lib/redis:/data redis:7 /usr/local/bin/redis-server
sudo docker start redis

sudo mkdir -p /var/lib/postgresql
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-postgres-4 /var/lib/postgresql/data
sudo docker run -d --name postgres --restart=always --log-opt max-size=1g -e "PGDATA=/var/lib/postgresql/data/pgdata" -v /var/lib/postgresql/data:/var/lib/postgresql/data --net=host postgres:9.5

sudo docker run -d --name backend --restart=always --net=host --log-opt max-size=1g -e PROVIDER=gce -e GROUP=backend -e FRONTEND_PORT=80 odota/core:latest sh -c "npm start"
sudo docker start backend
sudo docker logs -f backend