	
#!/bin/bash

#curl -sSL https://get.docker.com/ | sh

#sudo apt-get install xfsprogs
#sudo mkfs.xfs -b size=4k /dev/disk/by-id/google-persistent-disk-1
sudo mkdir -p /var/lib/scylla
sudo mount -o discard,defaults /dev/disk/by-id/google-persistent-disk-1 /var/lib/scylla

sudo docker run --name scylla --restart=always --log-opt max-size=1g -d --net=host -v /var/lib/scylla:/var/lib/scylla scylladb/scylla:5.4 --developer-mode=0 --overprovisioned=0
sudo docker start scylla