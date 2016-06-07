#!/bin/bash

NAME='yasp_db'

function wipe {
    CONTAINER=`docker ps -a | grep $NAME | head -c 12`
    if [ -n "$CONTAINER" ]
        then
        docker stop $CONTAINER
        docker rm $CONTAINER
        docker rmi $NAME
    fi
}

function run_db_1 {
    docker run -d --name $NAME --net=host postgres:9.5
    sleep 10 # we wait until the db is ready. Your mileage may vary.
    docker exec -i $NAME psql -U postgres < sql/init.sql
    docker exec -i $NAME psql -U postgres yasp < sql/create_tables.sql
}

function run_db_2 {
    docker-compose -f docker-compose.yml -f docker/db-options/launch_only/docker-compose.override.yml up -d db 
    sleep 10
    docker exec -i "$NAME"_1 psql -U postgres < sql/init.sql
    docker exec -i "$NAME"_1 psql -U postgres yasp < sql/create_tables.sql
}

function run_db_3 {
    # fails with
    # ERROR:  syntax error at or near ")" at character 22
    # STATEMENT:  INSERT INTO matches () VALUES () ON CONFLICT (match_id) DO UPDATE SET 
    docker-compose -f docker-compose.yml -f docker/db-options/sql-files-as-is/docker-compose.override.yml up db 
}

function run_db_4 {
    docker run -d --name $NAME --net=host postgres:9.5
    sleep 10 # we wait until the db is ready. Your mileage may vary.
    docker exec -i $NAME psql -U postgres < sql/init.sql
    cp sql/create_tables.sql docker/db-options/sql-prepended
    echo '\\c yasp' | ./docker/db-options/sql-prepended/prepend.sh docker/db-options/sql-prepended/create_tables.sql
    docker exec -i $NAME psql -U postgres < docker/db-options/sql-prepended/create_tables.sql
}

function run_db_5 {
    docker-compose -f docker-compose.yml -f docker/db-options/sql-prepended/docker-compose.override.yml up db 
}

wipe
run_db_5
