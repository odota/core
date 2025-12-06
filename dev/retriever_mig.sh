#!/bin/bash

# Secrets don't need to be set since they're read from GCE metadata
sudo docker run -d --name=retriever --net=host --log-opt max-size=1g -e PROVIDER=gce -e NODE_ENV=production -e RETRIEVER_PORT=80 -e ROLE=retriever odota/retriever:latest

# If already initialized
sudo docker start retriever

export NAME=$(curl -X GET http://metadata.google.internal/computeMetadata/v1/instance/name -H 'Metadata-Flavor: Google')
export ZONE=$(curl -X GET http://metadata.google.internal/computeMetadata/v1/instance/zone -H 'Metadata-Flavor: Google')

sudo docker logs -f retriever && gcloud compute instance-groups managed delete-instances retriever --instances=$NAME --zone=$ZONE