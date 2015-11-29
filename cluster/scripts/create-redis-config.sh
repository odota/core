#!/bin/bash
ENCODED=$(cat ../setup/redis.conf | base64 -w0)
sed -e "s#{{data}}#${ENCODED}#g" ../setup/redis-config-template.yaml > redis-config.yaml
