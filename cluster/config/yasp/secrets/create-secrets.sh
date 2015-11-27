#!/bin/bash

if [ ! -f apikeys.env ]; then
  echo "You need to create a file named apikeys.env"
  exit 1
fi

ENCODED=$(cat apikeys.env | base64 -w0)
sed -e "s#{{secret_data}}#${ENCODED}#g" apikey-secret-template.yaml > apikey-secret.yaml
