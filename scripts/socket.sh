#!/bin/bash
curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name=socket --restart=always --net=host --log-opt max-size=1g -e PROVIDER=gce -e ROLE=socket odota/core:latest sh -c "npm start"
sudo docker start socket