#!/bin/bash
# curl -sSL https://get.docker.com/ | sh
sudo docker run -d --name=fullhistory --restart=always --net=host --log-opt max-size=1g -e PROVIDER=gce -e ROLE=fullhistory howardc93/core:latest sh -c "npm start"
sudo docker start fullhistory