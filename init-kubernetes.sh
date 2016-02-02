#install gcloud sdk
curl https://sdk.cloud.google.com | bash

#attach gcloud to project
gcloud init

gcloud components install kubectl

export KUBERNETES_PROVIDER=gce
export KUBE_GCE_ZONE=us-central1-b
export MASTER_SIZE=n1-highmem-8
export NODE_SIZE=n1-highcpu-2
export NODE_DISK_SIZE=10GB
export PREEMPTIBLE_NODE=true
export KUBE_GCE_NETWORK=k8s

export ENABLE_CLUSTER_MONITORING=googleinfluxdb
export ENABLE_NODE_AUTOSCALER=true
export ENABLE_DAEMONSETS=true
export ENABLE_DEPLOYMENTS=true

export KUBE_UP_AUTOMATIC_CLEANUP=true

curl -L https://github.com/kubernetes/kubernetes/releases/download/v1.2.0-alpha.6/kubernetes.tar.gz | tar xvz

bash ./kubernetes/cluster/kube-up.sh

#persistent disks
gcloud compute disks create "disk-redis" --size "50" --zone "us-central1-b" --type "pd-ssd"
gcloud compute disks create "disk-postgres" --size "2000" --zone "us-central1-b" --type "pd-ssd"
#use persistent volumes/claims for cassandra storage?
#gcloud compute disks create "disk-cassandra-1" --size "200" --zone "us-central1-b" --type "pd-ssd"

#create namespace
kubectl create -f ./cluster/setup/namespace.yaml

kubectl config set-context peaceful-parity-87002_kubernetes --namespace=yasp

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
createdb yasp --owner yasp
psql yasp -c "CREATE EXTENSION pg_trgm;"
#exit remote shell
cat "sql/create_tables.sql" | kubectl exec postgres-q4s59 -i -- psql postgresql://yasp:yasp@postgres/yasp

#backup/restore
pg_dump -d postgres://yasp:yasp@localhost/yasp -f - --format=c | kubectl exec postgres-rairo -i -- pg_restore -d postgres://yasp:yasp@localhost/yasp --verbose
#mount disk-redis to /newdisk
cp /var/lib/redis/dump.rdb /newdisk/dump.rdb

#teardown cluster
#old prefix for teardown!
export INSTANCE_PREFIX=k8s-yasp
export KUBE_GCE_NETWORK=k8s
bash ./kubernetes/cluster/kube-down.sh

#deploy latest yasp to cluster with rolling update
#npm run deploy

#update kubernetes on cluster
#bash ./kubernetes/cluster/gce/upgrade.sh