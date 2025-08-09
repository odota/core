#!/bin/bash

sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -w -A INPUT -p tcp --dport 5600 -j ACCEPT

sudo docker run -d --name parseServer --restart=always --net=host --log-opt max-size=1g -e SERVICE_REGISTRY_HOST=api.opendota.com -e RETRIEVER_SECRET=REPLACE_ME odota/parser
sudo docker start parseServer

# If not using service registry, also run the parser queue/insert and use localhost Java parser
# sudo docker run -d --name=parser --restart=always --net=host --log-opt max-size=1g -e SERVICE_REGISTRY_HOST= -e PARSER_HOST=localhost:5600 -e PARSER_PARALLELISM=4 -e PROVIDER=gce -e PORT=80 -e ROLE=parser odota/core:latest sh -c "npm start"
# sudo docker start parser