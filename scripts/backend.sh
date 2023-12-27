#!/bin/bash
sudo docker run -d --name backend --restart=always --net=host --log-opt max-size=1g -e PROVIDER=gce -e GROUP=backend howardc93/core:latest sh -c "npm start"
sudo docker start backend
sudo docker logs -f backend || true
sudo reboot