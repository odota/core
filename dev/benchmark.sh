#!/bin/bash

curl -sSL https://get.docker.com/ | sh

sudo docker run -d --net=host odota/parser

time curl --silent http://replay152.valve.net/570/7503212404_1277518156.dem.bz2 | bunzip2 | curl --silent -X POST -T - localhost:5600 > /dev/null