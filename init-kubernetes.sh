#install gcloud sdk
curl https://sdk.cloud.google.com | bash

#attach gcloud to project
gcloud init

#source cluster config to env
source ./cluster/setup/gce.env

#set up kubernetes cluster
wget -q -O - https://get.k8s.io | bash

#put secrets in .env (KEY=VALUE, one per line)
#write secrets/config to kubernetes secret resource
bash ./cluster/scripts/create-secrets.sh < .env | kubectl create -f -
bash ./cluster/scripts/create-postgres-config.sh | kubectl create -f -
bash ./cluster/scripts/create-redis-config.sh | kubectl create -f -

#create namespace
kubectl create -f ./cluster/yasp/namespace.yaml

#add yasp services to cluster, redis, postgres
kubectl create -f ./cluster/yasp

#put redis data in GCE disk "disk-redis"
#put postgres data in GCE disk "disk-postgres"

#secure remote connections to redis/postgres
#set up redis password
redis-cli config set requirepass yasp
#set up postgres password
psql -c "ALTER USER yasp with password yasp"