#!/bin/bash

# Setup
curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name=retriever --restart=always --net=host --log-opt max-size=1g -e RETRIEVER_PORT=80 -e PROVIDER=gce -e ROLE=retriever odota/core:latest sh -c "npm start"

# If already initialized
sudo docker start retriever
sudo docker logs -f retriever && gcloud compute instances delete $(hostname) -q