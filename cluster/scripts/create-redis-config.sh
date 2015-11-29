#!/bin/bash
#go to git root
cd `git rev-parse --show-toplevel`
ENCODED=$(cat cluster/setup/redis.conf | base64 -w0)
sed -e "s#{{data}}#${ENCODED}#g" cluster/setup/redis-config-template.yaml
