#install gcloud sdk
curl https://sdk.cloud.google.com | bash

#attach gcloud to project
gcloud init

#persistent disks
gcloud compute disks create "disk-redis" --size "50" --zone "us-central1-b" --type "pd-ssd"
gcloud compute disks create "disk-postgres" --size "2000" --zone "us-central1-b" --type "pd-ssd"
#use persistent volumes/claims for cassandra storage
#gcloud compute disks create "disk-cassandra-1" --size "100" --zone "us-central1-b" --type "pd-ssd"
#gcloud compute disks create "disk-cassandra-2" --size "100" --zone "us-central1-b" --type "pd-ssd"
#gcloud compute disks create "disk-cassandra-3" --size "100" --zone "us-central1-b" --type "pd-ssd"

#download kubernetes release
curl -L https://github.com/kubernetes/kubernetes/releases/download/v1.1.7/kubernetes.tar.gz | tar xvz

#get kubectl
#gcloud components install kubectl
#or use kubectl packaged with release
export PATH=./kubernetes/platforms/linux/amd64:$PATH

#set up config for cluster
export KUBERNETES_PROVIDER=gce
export KUBE_GCE_ZONE=us-central1-b
export MASTER_SIZE=n1-standard-1
export MINION_SIZE=n1-highcpu-2
export MINION_DISK_SIZE=10GB
export PREEMPTIBLE_MINION=true
export KUBE_ENABLE_NODE_AUTOSCALER=true

#start the cluster
bash ./kubernetes/cluster/kube-up.sh

#create, use namespace
kubectl create -f ./cluster/setup/namespace.yaml
kubectl config set-context peaceful-parity-87002_kubernetes --namespace=yasp

#put secrets in GCE project metadata
#write secrets/config to kubernetes secret resource
bash ./cluster/scripts/create-postgres-config.sh | kubectl create -f -
bash ./cluster/scripts/create-redis-config.sh | kubectl create -f -

#add infra
kubectl create -f ./cluster/infra
#add yasp services
kubectl create -f ./cluster/backend

#make master schedulable
#kubectl edit no kubernetes-master
#or clone node template for custom nodes (hm-2, etc)

#set up db on postgres node
kubectl exec -it postgres-0hu0e "bash"
su postgres 
bash
createuser yasp
psql -c "ALTER USER yasp WITH PASSWORD 'yasp';"
createdb yasp --owner yasp
#exit remote shell, create tables
#cat "sql/trgm.sql" | kubectl exec postgres-q4s59 -i -- psql postgresql://yasp:yasp@postgres/yasp
#cat "sql/create_tables.sql" | kubectl exec postgres-q4s59 -i -- psql postgresql://yasp:yasp@postgres/yasp

#backup/restore
pg_dump -d postgres://yasp:yasp@localhost/yasp | kubectl exec postgres-v368o -i -- psql -d postgres://yasp:yasp@localhost/yasp
#pg_dump -d postgres://yasp:yasp@localhost/yasp --format=c -f yasp.sql
#cat yasp.sql | kubectl exec postgres-v368o -i -- pg_restore -d postgres://yasp:yasp@localhost/yasp --verbose --clean --create
#mount disk-redis to /newdisk
cp /var/lib/redis/dump.rdb /newdisk/dump.rdb

#teardown cluster
bash ./kubernetes/cluster/kube-down.sh

#deploy latest yasp to cluster with rolling update
#npm run deploy

#update kubernetes on cluster
#bash ./kubernetes/cluster/gce/upgrade.sh release-stable

#nonkube
gcloud compute project-info add-metadata --metadata-from-file env=./prod.env

gcloud compute instance-templates create core-1 --machine-type n1-highmem-8 --image container-vm --disk name=disk-redis --disk name=disk-postgres --tags "http-server" --metadata-from-file startup-script=./cluster/scripts/core.sh
gcloud compute --project "peaceful-parity-87002" instance-groups managed create "core-group-1" --zone "us-central1-b" --base-instance-name "core-group-1" --template "core-1" --size "1"

gcloud compute instance-templates create parser-1 --machine-type n1-highcpu-2   --image container-vm   --preemptible --metadata-from-file startup-script=./cluster/scripts/parser.sh
gcloud compute --project "peaceful-parity-87002" instance-groups managed create "parser-group-1" --zone "us-central1-b" --base-instance-name "parser-group-1" --template "parser-1" --size "1"
gcloud compute --project "peaceful-parity-87002" instance-groups managed set-autoscaling "parser-group-1" --zone "us-central1-b" --cool-down-period "60" --max-num-replicas "30" --min-num-replicas "1" --target-cpu-utilization "0.8"