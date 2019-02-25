#!/bin/bash

VMNAME=$(hostname)
ZONE=$(curl -H Metadata-Flavor:Google http://metadata/computeMetadata/v1/instance/zone | cut -d/ -f4)

sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

sudo docker start retriever

# Setup
while true
do
sudo docker run -d --name=retriever --net=host --restart=always --log-opt max-size=1g -e RETRIEVER_PORT=80 -e PROVIDER=gce -e ROLE=retriever odota/core:latest sh -c "npm start" && break
sleep 5
done

sudo docker logs -f retriever
gcloud compute instances delete $VMNAME --zone $ZONE --quiet