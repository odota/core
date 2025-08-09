#!/bin/bash

function hang_until_cassandra_is_ready () {
    # We check nodetool until we get a report that Cassandra status is Up and Normal
    until [[ $CASS_STATUS == "UN" ]]; do
        sleep 5;
        echo "$0: checking if Cassandra is up already..."
        CASS_STATUS=`nodetool -h odota-cassandra status | tail --lines=2 | cut --bytes=1-2`
    done 
    echo "$0: Cassandra appears to be Up and Normal, proceeding..."
	# Needs more hanging here!
	sleep 15
}

hang_until_cassandra_is_ready
