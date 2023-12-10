#!/bin/bash

echo "$0: forked off"
set -e # if one init command fails - everything fails

function hang_until_cassandra_is_ready () {
    # We check nodetool until we get a report that Cassandra status is Up and Normal
    until [[ $CASS_STATUS == "UN" ]]; do
        sleep 1;
        echo "$0: checking if Cassandra is up already..."
        CASS_STATUS=`nodetool status | tail --lines=2 | cut --bytes=1-2`
    done 
    echo "$0: Cassandra appears to be Up and Normal, proceeding..."
# Needs more hanging here!
sleep 30
}

# function run_init_stuff () {
# 	for f in /docker-entrypoint-init.d/*; do
# 		case "$f" in
# 			*.sh)     echo "$0: running $f"; . "$f" ;;
# 			*.cql)    echo "$0: running $f"; cqlsh < "$f"; echo ;;
# 			*.cql.gz) echo "$0: running $f"; gunzip -c "$f" | cqlsh; echo ;;
# 			*)        echo "$0: ignoring $f" ;;
# 		esac
# 		echo
# 	done
#     echo "$0: Initialization complete."
# }

hang_until_cassandra_is_ready
# run_init_stuff