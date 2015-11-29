#!/bin/bash
echo "Initializing..."
source /root/.bashrc
source /etc/yasp-api-keys/secrets.env
eval "$@"
