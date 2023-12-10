#!/bin/bash

for f in /docker-entrypoint-init.d/*; do
    case "$f" in
        *.cql)    echo "$0: running $f" && 
            until cqlsh -f "$f"; do 
                >&2 echo "Unavailable: sleeping"; 
                sleep 10; 
            done & ;;
    esac
    echo
done

exec /docker-entrypoint.py "$@"