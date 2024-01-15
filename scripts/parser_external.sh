#!/bin/bash

curl -sSL https://get.docker.com/ | sh

sudo docker run -d --name parseServer --restart=always --net=host -e SERVICE_REGISTRY_HOST=api.opendota.com -e EXTERNAL=1 --log-opt max-size=1g odota/parser
sudo docker start parseServer
