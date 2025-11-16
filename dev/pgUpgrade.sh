#!/bin/bash

sudo apt update
sudo apt install -y postgresql-common ca-certificates
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh

#sudo apt install postgresql-9.5
sudo apt install postgresql-18

sudo mkfs.ext4 -F -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/disk/by-id/google-disk-postgres-new
#sudo mkdir -p /var/lib/postgres-old
#sudo mount -o discard,defaults /dev/disk/by-id/google-disk-postgres-old /var/lib/postgres-old
mkdir -p /var/lib/postgres-new
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-postgres-new /var/lib/postgres-new
#sudo chown -R suuuncon /var/lib/postgres-new
#sudo chown -R suuuncon /var/lib/postgres-old
#sudo chmod -R 0700 /var/lib/postgres-new/
#sudo chmod -R 0700 /var/lib/postgres-old/
/usr/lib/postgresql/18/bin/initdb -D /var/lib/postgres-new/pgdata
#/usr/lib/postgresql/18/bin/pg_checksums -d /var/lib/postgres-new/pgdata
#sudo systemctl stop postgresql

#/usr/lib/postgresql/18/bin/pg_upgrade --old-bindir=/usr/lib/postgresql/9.5/bin --new-bindir=/usr/lib/postgresql/18/bin --old-datadir=/var/lib/postgres-old/pgdata --new-datadir=/var/lib/postgres-new/pgdata

psql -U postgres < init.sql
psql -U postgres < create_tables.sql

# allow pg through COS firewall
sudo iptables -w -A INPUT -p tcp --dport 5432 -j ACCEPT

pg_dump -U postgres --host=10.240.0.35 --clean yasp | psql -U postgres --database=yasp
