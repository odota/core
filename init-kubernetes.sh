#install gcloud sdk
curl https://sdk.cloud.google.com | bash

#attach gcloud to project
gcloud init

#source cluster config to env
source ./cluster/setup/gce.env

#set up kubernetes cluster
wget -q -O - https://get.k8s.io | bash

#copy k8s-yasp-minion-template, use hm-4, make new instance group

#put redis data in GCE disk "disk-redis"
gcloud compute disks create "disk-redis" --size "50" --zone "us-central1-f" --type "pd-ssd"
#put postgres data in GCE disk "disk-postgres"
gcloud compute disks create "disk-postgres" --size "50" --zone "us-central1-f" --type "pd-ssd"

#create namespace
kubectl create -f ./cluster/setup/namespace.yaml

#put secrets in prod.env (KEY=VALUE, one per line)
#write secrets/config to kubernetes secret resource
bash ./cluster/scripts/create-secrets.sh < prod.env | kubectl create -f -
bash ./cluster/scripts/create-postgres-config.sh | kubectl create -f -
bash ./cluster/scripts/create-redis-config.sh | kubectl create -f -

#add yasp services to cluster, redis, postgres
kubectl create -f ./cluster/yasp

#set up db on postgres node
kubectl exec postgres-ltm1a "bash" -it
su postgres 
bash
createuser yasp && psql -c "ALTER USER yasp WITH PASSWORD 'yasp';" && createdb yasp --owner yasp && psql yasp
#create_tables.sql

#copy old data
rsync -rav --info=progress2 /var/lib/redis/ /newdisk/var/lib/redis
rsync -rav --info=progress2 /var/lib/postgresql/9.4/main/ /var/lib/postgres/data/pgdata
 
#secure remote connections to redis/postgres
#set up redis password
#redis-cli config set requirepass yasp
#set up postgres password
#psql -c "ALTER USER yasp with password yasp"

#to update the cluster
#npm run deploy