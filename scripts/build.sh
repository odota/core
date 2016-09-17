#!/bin/bash

sudo docker-compose up
docker exec -i odota-core sh -c 'npm run test'
