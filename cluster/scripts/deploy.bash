#!/bin/bash

#push image to docker hub
if [ -n "$DOCKER_EMAIL" ]; then
  docker login -e="$DOCKER_EMAIL" -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWORD"
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
fi

if [ -n "$DEPLOY_WEBHOOK_URL" ]; then
  echo "Hitting deploy webhook URL..."
  curl $DEPLOY_WEBHOOK_URL/$DEPLOY_WEBHOOK_SECRET/$TRAVIS_BUILD_ID > /dev/null
fi

if [ -n "$KUBECONFIG" ]; then
  mkdir ~/.kube
  echo "$KUBECONFIG" | base64 --decode > ~/.kube/config
  export PATH="$PATH:$TRAVIS_BUILD_DIR/test/testfiles"
  kubectl get rc -o name --selector tier=backend | cut -d '/' -f2 | xargs kubectl rolling-update --image=yasp/yasp:$TRAVIS_COMMIT
fi