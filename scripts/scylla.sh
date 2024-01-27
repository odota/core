	
#!/bin/bash

#sudo apt-get install xfsprogs
#sudo mkfs.xfs -b size=4k /dev/disk/by-id/google-persistent-disk-1
sudo mkdir -p /var/lib/scylla
sudo mount -o discard,defaults /dev/disk/by-id/google-persistent-disk-1 /var/lib/scylla

#sudo mkdir -p /etc/apt/keyrings
#sudo gpg --homedir /tmp --no-default-keyring --keyring /etc/apt/keyrings/scylladb.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys d0a112e067426ab2
#sudo wget -O /etc/apt/sources.list.d/scylla.list http://downloads.scylladb.com/deb/debian/scylla-5.4.list

#sudo apt-get update
#sudo apt-get install -y scylla

# Set listen_address in scylla.yaml to internal IP to allow other nodes to connect
#cat /etc/scylla/scylla.yaml
#sudo scylla_setup
sudo systemctl start scylla-server