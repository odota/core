#!/bin/bash
#sudo mkfs.ext4 -F -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/disk/by-id/google-disk-cassandra-3
sudo iptables -I INPUT -p tcp --dport 7000 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 9042 -j ACCEPT

sudo mkdir -p /var/lib/cassandra
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-cassandra-3 /var/lib/cassandra

#remove seed if initial node
#-e CASSANDRA_SEEDS=cassandra-1
sudo docker run --name cassandra --restart=always --log-opt max-size=1g -d --net=host -v /var/lib/cassandra:/var/lib/cassandra -e CASSANDRA_NUM_TOKENS=256 cassandra:5

sudo docker start cassandra