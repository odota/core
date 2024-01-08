#!/bin/bash

sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -w -A INPUT -p tcp --dport 5600 -j ACCEPT

sudo docker run -d --name parseServer --restart=always --net=host --log-opt max-size=1g odota/parser
sudo docker start parseServer

sudo docker run -d --name=parser --restart=always --net=host --log-opt max-size=1g -e PARSER_HOST=http://localhost:5600 -e PARSER_PARALLELISM=8 -e PROVIDER=gce -e PORT=80 -e ROLE=parser odota/core:latest sh -c "npm start"
sudo docker start parser