#!/bin/bash
ENCODED=$(cat | base64 -w0)
sed -e "s#{{secret_data}}#${ENCODED}#g" ./cluster/config/setup/secret-template.yaml
