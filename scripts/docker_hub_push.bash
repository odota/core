#!/bin/bash

TAG=
if [ -n "$TRAVIS_COMMIT" ]; then
  echo "Using travis commit ID as tag..."
  TAG=$TRAVIS_COMMIT
fi
if [ -z "$TAG" ]; then
  echo "Unable to determine tag to push to."
fi
echo "Pushing to yasp/yasp:${TAG}"
docker tag yasp/yasp:latest yasp/yasp:${TAG}
docker push yasp/yasp:${TAG}
docker push yasp/yasp:latest

if [ -n "$DEPLOY_WEBHOOK_URL" ]; then
  echo "Hitting deploy webhook URL..."
  curl $DEPLOY_WEBHOOK_URL/$DEPLOY_WEBHOOK_SECRET/$TRAVIS_BUILD_ID > /dev/null
fi
