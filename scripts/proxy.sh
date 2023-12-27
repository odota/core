#!/bin/bash
sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

sudo docker start proxy

while true
do
sudo docker run -d --name=proxy --restart=always --net=host --log-opt max-size=1g -e PROXY_PORT=80 -e PROVIDER=gce -e ROLE=proxy howardc93/core:latest sh -c "npm start" && break
sleep 5
done