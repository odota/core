#!/bin/bash

sudo docker-compose up -d
sudo docker exec -i odota-core sh -c 'npm run test'
