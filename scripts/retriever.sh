#!/bin/bash

VMNAME=$(hostname)
ZONE=$(curl -H Metadata-Flavor:Google http://metadata/computeMetadata/v1/instance/zone | cut -d/ -f4)

# Setup
# Docker install not needed if using gci image
curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name=retriever --restart=always --net=host --log-opt max-size=1g -e RETRIEVER_PORT=80 -e PROVIDER=gce -e ROLE=retriever odota/core:latest sh -c "npm start"

# If already initialized
sudo docker start retriever

while true; do
sudo docker logs -f retriever /
&& gcloud compute instances delete-access-config $VMNAME --quiet --access-config-name=external-nat --zone=$ZONE /
&& gcloud compute instances add-access-config $VMNAME --quiet --access-config-name=external-nat --zone=$ZONE /
&& sudo docker restart retriever
done