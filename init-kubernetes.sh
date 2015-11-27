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

#set up openshift on cluster
bash ./cluster/config/openshift-origin/create.sh

#login to openshift
oc login http://os.yasp.co
#create a new project
oc new-project yasp

#suppress secret warning
oc secrets add serviceaccount/default secrets/api-keys

#put secrets in .env (KEY=VALUE, one per line)
#set up secrets
bash create-secrets.sh < .env | oc create -f -

#add yasp services to cluster, redis, postgres
oc create -f ./cluster/config/yasp

#set up redis password
redis-cli config set requirepass yasp

#set up postgres password
psql -c "ALTER USER yasp with password yasp"