#!/bin/bash

curl -sSL https://get.docker.com/ | sh
#sudo mkfs.ext4 -F -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/disk/by-id/google-persistent-disk-1

sudo mkdir -p /var/lib/scylla
sudo mount -o discard,defaults /dev/disk/by-id/google-persistent-disk-1 /var/lib/scylla

#remove seed if initial node
# -e SCYLLA_SEEDS=scylla-1
sudo docker run --name scylla --restart=always --log-opt max-size=1g -d --net=host -v /var/lib/scylla:/var/lib/scylla scylladb/scylla:5.4 --developer-mode=0
sudo docker start scylla