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

sudo docker run -d --name web --restart=always --net=host yasp/yasp:latest "./node_modules/pm2/bin/pm2 start web.js -i 0 && sleep infinity"
sudo docker run -d --name worker --restart=always --net=host yasp/yasp:latest "node worker.js"
sudo docker run -d --name scanner --restart=always --net=host yasp/yasp:latest "node scanner.js"
sudo docker run -d --name skill --restart=always --net=host yasp/yasp:latest "node skill.js"
sudo docker run -d --name mmr --restart=always --net=host yasp/yasp:latest "node mmr.js"
sudo docker run -d --name fullhistory --restart=always --net=host yasp/yasp:latest "node fullhistory.js"
sudo docker run -d --name cacher --restart=always --net=host yasp/yasp:latest "node cacher.js"
sudo docker run -d --name requests --restart=always --net=host yasp/yasp:latest "node requests.js"
sudo docker run -d --name profiler --restart=always --net=host yasp/yasp:latest "node profiler.js"
sudo docker run -d --name redis --restart=always -v /yasp/cluster/setup/redis.conf:/etc/redis/redis.conf -v /var/lib/redis:/var/lib/redis/ --net=host redis:3 -- redis-server /etc/redis/redis.conf
sudo docker run -d --name postgres --restart=always -u postgres -e "PGDATA=/var/lib/postgresql/data/pgdata" -v /var/lib/postgresql/data:/var/lib/postgresql/data -v /yasp/cluster/setup/pg_hba.conf:/etc/postgresql/pg_hba.conf -v /yasp/cluster/setup/postgresql.conf:/etc/postgresql/postgresql.conf --net=host postgres:9.5 -- postgres --config_file=/etc/postgresql/postgresql.conf