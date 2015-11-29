#!/bin/bash
echo "Initializing..."
source /root/.bashrc

if [ -f /etc/yasp-api-keys/secrets.env ]; then
  echo "Sourcing secrets from kubernetes mount..."
  source /etc/yasp-api-keys/*.env
fi

eval "$@"
