#install gcloud sdk
curl https://sdk.cloud.google.com | bash

#attach gcloud to project
gcloud init

gcloud components install kubectl

#source cluster config to env
source ./cluster/setup/gce.env

#set up kubernetes cluster
wget -q -O - https://get.k8s.io | bash

#copy k8s-yasp-minion-template, use hm, make new reliable instance(s) for dbs, preemptible for cassandra?

#persistent disks
gcloud compute disks create "disk-redis" --size "50" --zone "us-central1-b" --type "pd-ssd"
gcloud compute disks create "disk-postgres" --size "2000" --zone "us-central1-b" --type "pd-ssd"

#create namespace
kubectl create -f ./cluster/setup/namespace.yaml

kubectl config set-context peaceful-parity-87002_k8s-yasp --namespace=yasp

#put secrets in prod.env (KEY=VALUE, one per line)
#write secrets/config to kubernetes secret resource
bash ./cluster/scripts/create-secrets.sh < prod.env | kubectl create -f -
bash ./cluster/scripts/create-postgres-config.sh | kubectl create -f -
bash ./cluster/scripts/create-redis-config.sh | kubectl create -f -

#add infra
kubectl create -f ./cluster/infra
#add yasp services
kubectl create -f ./cluster/backend

#set up db on postgres node
kubectl exec -it postgres-q4s59 "bash"
su postgres 
bash
createuser yasp
psql -c "ALTER USER yasp WITH PASSWORD 'yasp';"
psql -c "CREATE EXTENSION pg_trgm;"
createdb yasp --owner yasp
#exit remote shell
cat "sql/create_tables.sql" | kubectl exec postgres-q4s59 -i -- psql postgresql://yasp:yasp@postgres/yasp

#secure remote connections to redis/postgres
#set up redis password
#redis-cli config set requirepass yasp
#set up postgres password
#psql -c "ALTER USER yasp with password yasp"

#to update the cluster
#npm run deploy

#backup/restore
pg_dump -d postgres://yasp:yasp@localhost/yasp -f - --format=c -t players | kubectl exec postgres-i1f5k -i -- pg_restore -d postgres://yasp:yasp@localhost/yasp
pg_dump -d postgres://yasp:yasp@localhost/yasp -f - --format=c -T players | kubectl exec postgres-rairo -i -- pg_restore -d postgres://yasp:yasp@localhost/yasp
cat yasp.sql | kubectl exec postgres-rairo -i -- pg_restore -d postgres://yasp:yasp@localhost/yasp
#pg_dump -d postgres://yasp:yasp@localhost/yasp -f - --format=c | kubectl exec postgres-i1f5k -i -- pg_restore -d postgres://yasp:yasp@localhost/yasp --clean --create
#mount disk-redis to /newdisk
cp /var/lib/redis/dump.rdb /newdisk/dump.rdb

#set nodeselector on monitoring-influxdb-grafana-v2 to reliable instance

#teardown cluster
source ./cluster/setup/gce.env
bash ./kubernetes/cluster/kube-down.sh
