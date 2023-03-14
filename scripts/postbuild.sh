#!/bin/bash

if [ -n "$DOCKER_USERNAME" ]; then
  echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin
  docker tag odota/core:latest
  docker push odota/core:latest
  docker tag howardc93/core:latest
  docker push howardc93/core:latest
fi
