#!/bin/bash
curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name parserHost --restart=always --net=host yasp/parser
sudo docker start parserHost
sudo docker run -d --name=parser --restart=always --net=host -e PROVIDER=gce -e ROLE=parser odota/core:latest sh -c "npm start"
sudo docker start parser