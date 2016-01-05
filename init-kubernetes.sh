#install gcloud sdk
curl https://sdk.cloud.google.com | bash

#attach gcloud to project
gcloud init

#source cluster config to env
source ./cluster/setup/gce.env

#set up kubernetes cluster
wget -q -O - https://get.k8s.io | bash

#copy k8s-yasp-minion-template, use hm, make new instance(s) for postgres/redis

#put redis data in GCE disk "disk-redis"
gcloud compute disks create "disk-redis" --size "50" --zone "us-central1-f" --type "pd-ssd"
#put postgres data in GCE disk "disk-postgres"
gcloud compute disks create "disk-postgres" --size "2000" --zone "us-central1-f" --type "pd-ssd"

#create namespace
kubectl create -f ./cluster/setup/namespace.yaml

#put secrets in prod.env (KEY=VALUE, one per line)
#write secrets/config to kubernetes secret resource
bash ./cluster/scripts/create-secrets.sh < prod.env | kubectl create -f -
bash ./cluster/scripts/create-postgres-config.sh | kubectl create -f -
bash ./cluster/scripts/create-redis-config.sh | kubectl create -f -

#add yasp services, redis, postgres to cluster
kubectl create -f ./cluster/yasp

#set up db on postgres node
kubectl exec -it postgres-ltm1a "bash"
su postgres 
bash
createuser yasp
psql -c "ALTER USER yasp WITH PASSWORD 'yasp';"
createdb yasp --owner yasp
cat "sql/create_tables.sql" | kubectl exec postgres-cxo7r -i -- psql postgresql://yasp:yasp@postgres/yasp

#secure remote connections to redis/postgres
#set up redis password
#redis-cli config set requirepass yasp
#set up postgres password
#psql -c "ALTER USER yasp with password yasp"

#to update the cluster
#npm run deploy

#backup/restore
pg_dump -d postgres://yasp:yasp@localhost/yasp -f yasp.sql --format=c
#pg_restore -d postgres://yasp:yasp@localhost/yasp yasp.sql
cat "yasp.sql" | kubectl exec postgres-cxo7r -i -- pg_restore -d postgres://yasp:yasp@localhost/yasp
#mount disk-redis to /newdisk
cp /var/lib/redis/dump.rdb /newdisk/dump.rdb

#teardown cluster
source ./cluster/setup/gce.env
bash ./kubernetes/cluster/kube-down.sh