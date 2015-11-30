#!/bin/bash
#go to git root
cd `git rev-parse --show-toplevel`
ENCODED=$(cat | sed -e '/^export/!s/^/export /g' | base64 -w0)
sed -e "s#{{secret_data}}#${ENCODED}#g" ./cluster/setup/secret-template.yaml
