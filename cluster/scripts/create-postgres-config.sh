#!/bin/bash
CONF=$(cat ../setup/postgresql.conf | base64 -w0)
HBA=$(cat ../setup/pg_hba.conf | base64 -w0)
sed -e "s#{{conf}}#${CONF}#g" -e "s#{{hba}}#${HBA}#g" ../setup/postgres-config-template.yaml > postgres-config.yaml