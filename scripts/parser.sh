#!/bin/bash
curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name parseServer --restart=always --net=host odota/parser
sudo docker start parseServer
sudo docker run -d --name=parser --restart=always --net=host -e PROVIDER=gce -e ROLE=parser odota/core:latest sh -c "npm start"
sudo docker start parser