#!/bin/bash

#push image to docker hub
if [ -n "$DOCKER_USERNAME" ]; then
  docker login -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWORD"
  TAG=
  if [ -n "$TRAVIS_COMMIT" ]; then
    echo "Using travis commit ID as tag..."
    TAG=$TRAVIS_COMMIT
  fi
  if [ -z "$TAG" ]; then
    echo "Unable to determine tag to push to."
  fi
  docker tag yasp/yasp:latest yasp/yasp:${TAG}
  docker push yasp/yasp:${TAG}
  docker push yasp/yasp:latest
  docker push yasp/parser:latest
fi
