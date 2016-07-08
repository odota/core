#!/bin/bash
sudo mkdir -p /var/lib/postgresql/data
sudo mount -o discard,defaults /dev/disk/by-id/google-persistent-disk-1 /var/lib/postgresql/data

curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/postgresql > /var/lib/postgresql/data/pgdata/postgresql.conf
curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/pg_hba > /var/lib/postgresql/data/pgdata/pg_hba.conf

sudo docker run -d --name postgres --restart=always -e "PGDATA=/var/lib/postgresql/data/pgdata" -v /var/lib/postgresql/data:/var/lib/postgresql/data --net=host postgres:9.5
sudo docker start postgres