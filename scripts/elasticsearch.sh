#!/bin/bash

curl -sSL https://get.docker.com/ | sh

sudo mkdir /mnt/disks/es-1
sudo mount -o discard,defaults /dev/disk/by-id/google-disk-elasticsearch-1 /mnt/disks/es-1
sudo chown 1000:1000 -R /mnt/disks/es-1
#echo -e "[Service]\nLimitMEMLOCK=infinity" | sudo SYSTEMD_EDITOR=tee systemctl edit docker.service
#sudo systemctl daemon-reload
#sudo systemctl restart docker
echo 'vm.max_map_count = 262144' | sudo tee -a /etc/sysctl.d/max_map_count.conf
sudo systemctl restart systemd-sysctl.service
sudo iptables -w -A INPUT -p tcp --dport 9200 -j ACCEPT
docker run -d --ulimit memlock=-1:-1 --name elasticsearch --restart=always --log-opt max-size=1g -e "cluster.name=docker-cluster" -e "bootstrap.memory_lock=true" -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" -v /mnt/disks/es-1:/usr/share/elasticsearch/data --net=host docker.elastic.co/elasticsearch/elasticsearch:6.2.4