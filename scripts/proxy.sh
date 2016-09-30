#!/bin/bash
curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name=proxy --restart=always --net=host --log-opt max-size=1g -e PROXY_PORT=80 -e PROVIDER=gce -e ROLE=proxy odota/core:latest sh -c "npm start"
sudo docker start proxy