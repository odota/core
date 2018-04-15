#!/bin/bash
# Install Docker
# curl -sSL https://get.docker.com/ | sh
# Get the source
git clone https://github.com/odota/parser
# Build it
docker build ./parser -t odota/parser
# Set up the parser
docker run -d --net=host --name=parser odota/parser
# If not using Docker, install and run it directly
# apt-get install default-jdk
# apt-get install maven
# apt-get install bzip2
# mvn -q -f pom.xml clean install -U
# java -jar target/stats-0.1.0.jar 5600 &
# Download and decompress a replay
curl http://replay137.valve.net/570/3833080676_1296818202.dem.bz2 | bunzip2 > replay.dem
# POST it to the parser and time it
time curl localhost:5600 --data-binary "@replay.dem" > /dev/null