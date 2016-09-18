#!/bin/bash

sudo docker-compose up
sudo docker exec -i odota-core sh -c 'npm run test'
