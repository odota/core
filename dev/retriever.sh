#!/bin/bash
sudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT

# Secrets don't need to be set since they're read from GCE metadata
sudo docker run -d --name=retriever --net=host --log-opt max-size=1g -e PROVIDER=gce -e NODE_ENV=production -e RETRIEVER_PORT=80 -e ROLE=retriever odota/retriever:latest

# If already initialized
sudo docker start retriever

# We can set a time limit for termination on GCE, but it's cancelled if we shut down manually
sudo docker logs -f retriever
# && sleep 5 && sudo shutdown -h now