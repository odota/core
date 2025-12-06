#!/bin/bash

sudo mkdir -p /var/lib/redis
sudo mount -o discard,defaults /dev/disk/by-id/google-persistent-disk-1 /var/lib/redis
sudo echo never > /sys/kernel/mm/transparent_hugepage/enabled
sudo echo 1 > /proc/sys/vm/overcommit_memory

sudo docker run -d --name redis --restart=always --log-opt max-size=1g -v /var/lib/redis:/var/lib/redis --net=host redis:7 /usr/local/bin/redis-server /var/lib/redis/redis.conf
sudo docker start redis