#!/bin/bash

#sudo mkfs.ext4 -F -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/disk/by-id/google-persistent-disk-1
sudo mkdir -p /var/lib/cassandra
sudo mount -o discard,defaults /dev/disk/by-id/google-persistent-disk-1 /var/lib/cassandra

#remove seed if initial node
docker run --name cassandra --restart=always -d --net=host -v /var/lib/cassandra:/var/lib/cassandra -e CASSANDRA_SEEDS=cassandra-1 cassandra:3
sudo docker start cassandra