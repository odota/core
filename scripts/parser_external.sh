#!/bin/bash

curl -sSL https://get.docker.com/ | sh

sudo docker run -d --name parseServer --restart=always --net=host --log-opt max-size=1g odota/parser
sudo docker start parseServer
