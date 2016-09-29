#!/bin/bash
curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name=retriever --restart=always --net=host --log-opt max-size=1g -e RETRIEVER_PORT=80 -e PROVIDER=gce -e ROLE=proxy odota/core:latest sh -c "npm start"
sudo docker start retriever