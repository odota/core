#!/bin/bash
rm -rf yasp
git clone https://github.com/yasp-dota/yasp

sudo mkdir -p /var/lib/redis
sudo mount -o discard,defaults /dev/sdb /var/lib/redis
sudo mkdir -p /var/lib/postgresql/data
sudo mount -o discard,defaults /dev/sdc /var/lib/postgresql/data
sudo echo never > /sys/kernel/mm/transparent_hugepage/enabled

sudo docker pull yasp/yasp
sudo docker rm -f yasp
sudo docker rm -f redis
sudo docker rm -f postgres

sudo docker run -d --name yasp --restart=always --net=host yasp/yasp:latest "sleep infinity"
sudo docker exec yasp ./node_modules/pm2/bin/pm2 start web.js -i 0
sudo docker exec yasp ./node_modules/pm2/bin/pm2 start worker.js -i 1
sudo docker exec yasp ./node_modules/pm2/bin/pm2 start scanner.js -i 1
sudo docker exec yasp ./node_modules/pm2/bin/pm2 start skill.js -i 1
sudo docker exec yasp ./node_modules/pm2/bin/pm2 start mmr.js -i 1
sudo docker exec yasp ./node_modules/pm2/bin/pm2 start fullhistory.js -i 4
sudo docker exec yasp ./node_modules/pm2/bin/pm2 start cacher.js -i 2
sudo docker exec yasp ./node_modules/pm2/bin/pm2 start requests.js -i 1
sudo docker exec yasp ./node_modules/pm2/bin/pm2 start profiler.js -i 1
sudo docker run -d --name redis --restart=always -v /yasp/cluster/setup/redis.conf:/etc/redis/redis.conf -v /var/lib/redis:/var/lib/redis/ --net=host redis:3 -- redis-server /etc/redis/redis.conf
sudo docker run -d --name postgres --restart=always -u postgres -e "PGDATA=/var/lib/postgresql/data/pgdata" -v /var/lib/postgresql/data:/var/lib/postgresql/data -v /yasp/cluster/setup/pg_hba.conf:/etc/postgresql/pg_hba.conf -v /yasp/cluster/setup/postgresql.conf:/etc/postgresql/postgresql.conf --net=host postgres:9.5 -- postgres --config_file=/etc/postgresql/postgresql.conf