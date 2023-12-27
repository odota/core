#!/bin/bash

sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

sudo docker start parseServer
sudo docker start parser

while true
do
sudo docker run -d --name parseServer --restart=always --net=host --log-opt max-size=1g howardc93/parser && break
sleep 5
done

while true
do
sudo docker run -d --name=parser --restart=always --net=host --log-opt max-size=1g -e PROVIDER=gce -e PORT=80 -e ROLE=parser howardc93/core:latest sh -c "npm start" && break
sleep 5
done