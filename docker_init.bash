#!/bin/bash
if [ "$PROVIDER" = "gce" ]; then
sudo curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /usr/src/yasp/.env
fi
eval "$@"
