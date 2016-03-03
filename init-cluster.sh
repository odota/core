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

###

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

###

#prod env vars to metadata
gcloud compute project-info add-metadata --metadata-from-file env=./prod.env

#core
gcloud compute instances delete -q core-1
gcloud compute instances create core-1 --machine-type n1-highmem-8 --image container-vm --disk name=disk-redis --disk name=disk-postgres --boot-disk-size 200GB --boot-disk-type pd-ssd --tags "http-server" --metadata-from-file startup-script=./cluster/scripts/core.sh
#update core startup script
gcloud compute instances add-metadata core-1 --metadata-from-file startup-script=./cluster/scripts/core.sh

#parsers
gcloud compute instance-groups managed delete -q parser-group-1
gcloud compute instance-templates delete -q parser-1
gcloud compute instance-templates create parser-1 --machine-type n1-highcpu-2 --image container-vm --preemptible --metadata startup-script='#!/bin/bash
for i in `seq 1 3`;
do
    sudo docker run -d --restart=always yasp/yasp:latest "node parser.js"
done
'
gcloud compute instance-groups managed create "parser-group-1" --base-instance-name "parser-group-1" --template "parser-1" --size "1"
gcloud compute instance-groups managed set-autoscaling "parser-group-1" --cool-down-period "60" --max-num-replicas "50" --min-num-replicas "3" --target-cpu-utilization "0.7"

#cassandra
gcloud compute instances delete -q cassandra-1
gcloud compute instances delete -q cassandra-2
#seed node
gcloud compute instances create cassandra-1 --machine-type n1-highmem-2 --image container-vm --boot-disk-size 200GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
docker run --name cassandra --restart=always -d --net=host cassandra:latest
'
#joining node
gcloud compute instances create cassandra-2 --machine-type n1-highmem-2 --image container-vm --boot-disk-size 200GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
docker run --name cassandra --restart=always -d --net=host -e CASSANDRA_SEEDS=core-1 cassandra:latest
'

#rethinkdb
gcloud compute instances delete -q rethinkdb-1
gcloud compute instances delete -q rethinkdb-2
#seed node
gcloud compute instances create rethinkdb-1 --machine-type n1-highmem-2 --image container-vm --boot-disk-size 200GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
docker run --name rethinkdb -d --restart=always --net=host rethinkdb:latest
'
#joining node
gcloud compute instances create rethinkdb-2 --machine-type n1-highmem-2 --image container-vm --boot-disk-size 200GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
docker run --name rethinkdb -d --restart=always --net=host rethinkdb:latest rethinkdb --bind all --join cor-1:29015
'

#importer
gcloud compute instance-groups managed delete -q importer-group-1
gcloud compute instance-templates delete -q importer-1
gcloud compute instance-templates create importer-1 --machine-type n1-highcpu-4 --preemptible --image container-vm --metadata startup-script='#!/bin/bash
sudo docker run -d --name importer --restart=always --net=host yasp/yasp:latest "sh -c 'node dev/allMatches.js 0 1900000000 3000 2> /dev/null'"
'
gcloud compute instance-groups managed create "importer-group-1" --base-instance-name "importer-group-1" --template "importer-1" --size "1"

#postgres maintenance
gcloud compute instances create temp-1 --machine-type n1-standard-2 --image container-vm --disk name=temp-postgres --boot-disk-size 100GB --boot-disk-type pd-ssd

#redeploy yasp container
sudo docker pull yasp/yasp:latest && sudo docker stop yasp && sudo docker rm yasp && sudo docker run -d --name yasp --restart=always --net=host yasp/yasp:latest "node deploy.js"