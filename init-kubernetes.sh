sudo apt-get update
#install docker
sudo apt-get -y install docker.io
#install gcloud sdk
curl https://sdk.cloud.google.com | bash
#set up devbox for administration (oc and kubectl binaries)
wget -qO- https://github.com/openshift/origin/releases/download/v1.1/openshift-origin-v1.1-ac7a99a-linux-amd64.tar.gz | tar -zxv -C /usr/local/bin
cd ..
#clone kubernetes
git clone https://github.com/kubernetes/kubernetes
cd kubernetes
#source cluster config
source ./cluster/setup/gce.env
#build kubernetes and upload kubernetes images to GCE
make quick-release
#kube up to create cluster
bash ./kubernetes/cluster/kube-up.sh
cd ../yasp

#set up openshift on cluster
bash ./cluster/config/openshift-origin/create.sh

#login to openshift
oc login https://os.yasp.co
#create a new project
oc new-project yasp
#create resources
oc create -f ./cluster/config/
#put secret env vars in file
cp .env ./cluster/config/yasp/secrets/apikeys.env
bash ./cluster/config/yasp/secrets/create-secrets.sh
#set up secrets 
oc create -f ./cluster/config/yasp/secrets/apikey-secret.yaml
#replace secrets
oc replace -f ./cluster/config/yasp/secrets/apikey-secret.yaml

oc secrets add serviceaccount/default secrets/api-keys

#set up load balancer on GCE and point at web