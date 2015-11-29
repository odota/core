#install gcloud sdk
curl https://sdk.cloud.google.com | bash

#attach gcloud to project
gcloud init

#put oc and kubectl binaries in path
wget -qO- https://github.com/openshift/origin/releases/download/v1.1/openshift-origin-v1.1-ac7a99a-linux-amd64.tar.gz | tar -zxv -C /usr/local/bin

#source cluster config to env
source ./cluster/setup/gce.env

#set up kubernetes cluster
wget -q -O - https://get.k8s.io | bash

#put secrets in .env (KEY=VALUE, one per line)
#set up secrets
bash ./cluster/scripts/create-secrets.sh < .env | kubectl create -f -
bash ./cluster/scripts/create-postgres-config.sh < .env | kubectl create -f -
bash ./cluster/scripts/create-redis-config.sh < .env | kubectl create -f -

#add yasp services to cluster, redis, postgres
kubectl create -f ./cluster/yasp

#put redis data in GCE disk "disk-redis"
#put postgres data in GCE disk "disk-postgres"

#set up remote access from a kubernetes node
#set up redis password
redis-cli config set requirepass yasp
#set up postgres password
psql -c "ALTER USER yasp with password yasp"