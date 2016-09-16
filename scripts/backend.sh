#!/bin/bash
curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name backend --restart=always --net=host -e PROVIDER=gce -e GROUP=backend odota/core:latest sh -c "npm start"
sudo docker start backend