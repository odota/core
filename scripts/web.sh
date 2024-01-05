#!/bin/bash
sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

sudo docker start web

while true
do
sudo docker run -d --name=web --restart=always --net=host --log-opt max-size=1g -e FRONTEND_PORT=80 -e PROVIDER=gce -e ROLE=web odota/core:latest sh -c "npm start" && break
sleep 5
done