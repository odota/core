#set up devbox for administration (oc and kubectl binaries)
wget -qO- https://github.com/openshift/origin/releases/download/v1.1/openshift-origin-v1.1-ac7a99a-linux-amd64.tar.gz | tar -zxv -C /usr/local/bin
#install gcloud sdk
curl https://sdk.cloud.google.com | bash
#bootstrap the cluster
#wget -q -O - https://get.k8s.io | bash
oc create -f ./cluster/config/
#turn on autoscaling