#!/bin/bash

sudo docker-compose -d up
sudo docker exec -i odota-core sh -c 'npm run test'
