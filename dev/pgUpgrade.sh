#!/bin/bash

sudo apt install -y postgresql-common ca-certificates
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh

sudo apt update
sudo apt install postgresql-9.5
sudo apt install postgresql-18

sudo mkfs.ext4 -F -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/disk/by-id/google-disk-postgres-new
sudo mkdir -p /var/lib/postgres-old
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-postgres-old /var/lib/postgres-old
sudo mkdir -p /var/lib/postgres-new
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-postgres-new /var/lib/postgres-new
mkdir -p /var/lib/postgres-new/pgdata
sudo chmod -R 777 /var/lib/postgres-new/pgdata
sudo chmod -R 777 /var/lib/postgres-old/pgdata
/usr/lib/postgresql/18/bin/initdb -D /var/lib/postgres-new/pgdata
sudo systemctl stop postgresql

/usr/lib/postgresql/18/bin/pg_upgrade --old-bindir=/usr/lib/postgresql/9.5/bin --new-bindir=/usr/lib/postgresql/18/bin --old-datadir=/var/lib/postgres-old/pgdata --new-datadir=/var/lib/postgres-new/pgdata