#!/bin/bash
curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name=web --restart=always --net=host --log-opt max-size=1g -e FRONTEND_PORT=80 -e PROVIDER=gce -e ROLE=web odota/core:latest sh -c "npm start"
sudo docker start web