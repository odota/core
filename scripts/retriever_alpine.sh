#!/bin/bash

RETRIEVER_SECRET=REPLACE_ME
STEAM_ACCOUNT_DATA=REPLACE_ME

sudo docker run -d --name=retriever --net=host --log-opt max-size=1g -e NODE_ENV=production -e RETRIEVER_PORT=80 -e RETRIEVER_SECRET=$RETRIEVER_SECRET -e STEAM_ACCOUNT_DATA=$STEAM_ACCOUNT_DATA odota/retriever:latest

# If already initialized
sudo docker start retriever
sudo docker logs -f retriever && sleep 5 && sudo shutdown -h now