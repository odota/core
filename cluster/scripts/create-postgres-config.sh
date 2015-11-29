#!/bin/bash
#go to git root
cd `git rev-parse --show-toplevel`
CONF=$(cat cluster/setup/postgresql.conf | base64 -w0)
HBA=$(cat cluster/setup/pg_hba.conf | base64 -w0)
sed -e "s#{{conf}}#${CONF}#g" -e "s#{{hba}}#${HBA}#g" cluster/setup/postgres-config-template.yaml