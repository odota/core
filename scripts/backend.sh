#!/bin/bash
sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

sudo docker run -d --name backend --restart=always --net=host --log-opt max-size=1g -e PROVIDER=gce -e GROUP=backend -e FRONTEND_PORT=80 odota/core:latest sh -c "npm start"
sudo docker start backend
sudo docker logs -f backend || true
sudo reboot