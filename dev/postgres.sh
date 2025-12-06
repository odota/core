#!/bin/bash

sudo mkdir -p /var/lib/postgresql/data
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-postgres-4 /var/lib/postgresql/data

sudo docker run -d --name postgres --restart=always --log-opt max-size=1g -e "PGDATA=/var/lib/postgresql/data/pgdata" -v /var/lib/postgresql/data:/var/lib/postgresql/data --net=host postgres:9.5
sudo docker start postgres