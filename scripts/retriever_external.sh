#!/bin/bash

sudo docker run -d --name=retriever --net=host --log-opt max-size=1g -e NODE_ENV=production -e RETRIEVER_PORT=80 -e ROLE=retriever -e SERVICE_REGISTRY_HOST=api.opendota.com -e RETRIEVER_SECRET=REPLACE_ME odota/retriever:latest

# If already initialized
sudo docker start retriever
sudo docker logs -f retriever && sleep 5 && sudo shutdown -h now