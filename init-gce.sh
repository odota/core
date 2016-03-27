#prod env vars to metadata
gcloud compute project-info add-metadata --metadata-from-file env=./prod.env

#core (infra)
gcloud compute instances delete -q core-1
gcloud compute instances create core-1 --machine-type n1-highmem-8 --image container-vm --disk name=disk-redis --disk name=disk-postgres --boot-disk-size 200GB --boot-disk-type pd-ssd --tags "http-server" --metadata-from-file startup-script=./cluster/scripts/core.sh
#update core startup script
gcloud compute instances add-metadata core-1 --metadata-from-file startup-script=./cluster/scripts/core.sh

#web, health check, loadbalancer
gcloud compute forwarding-rules delete -q lb-rule
gcloud compute target-pools delete -q lb-pool
gcloud compute http-health-checks delete -q lb-check
gcloud compute instance-groups managed delete -q web-group-1
gcloud compute instance-templates delete -q web-1
gcloud compute instance-templates create web-1 --machine-type g1-small --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --tags "http-server" --metadata startup-script='#!/bin/bash
sudo docker run -d --restart=always --net=host -e FRONTEND_PORT=80 yasp/yasp:latest "node web.js"
'
gcloud compute instance-groups managed create "web-group-1" --base-instance-name "web-group-1" --template "web-1" --size "0"

gcloud compute --project "peaceful-parity-87002" http-health-checks create "lb-check" --port "80" --request-path "/healthz" --check-interval "5" --timeout "5" --unhealthy-threshold "2" --healthy-threshold "2"
gcloud compute --project "peaceful-parity-87002" target-pools create "lb-pool" --region "us-central1" --health-check "lb-check" --session-affinity "NONE"
gcloud compute --project "peaceful-parity-87002" forwarding-rules create "lb-rule" --region "us-central1" --address "104.197.19.32" --ip-protocol "TCP" --port-range "80" --target-pool "lb-pool"
gcloud compute --project "peaceful-parity-87002" instance-groups managed set-target-pools "web-group-1" --zone "us-central1-b" --target-pools "https://www.googleapis.com/compute/v1/projects/peaceful-parity-87002/regions/us-central1/targetPools/lb-pool"
gcloud compute instance-groups managed set-autoscaling "web-group-1" --cool-down-period "60" --max-num-replicas "50" --min-num-replicas "3" --target-cpu-utilization "0.7"

#backend
gcloud compute instance-groups managed delete -q backend-group-1
gcloud compute instance-templates delete -q backend-1
gcloud compute instance-templates create backend-1 --machine-type n1-standard-2 --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --tags "http-server" --metadata startup-script='#!/bin/bash
sudo docker run -d --name yasp --restart=always --net=host yasp/yasp:latest "node deploy.js core"
'
gcloud compute instance-groups managed create "backend-group-1" --base-instance-name "backend-group-1" --template "backend-1" --size "1"

#parsers
gcloud compute instance-groups managed delete -q parser-group-1
gcloud compute instance-templates delete -q parser-1
gcloud compute instance-templates create parser-1 --machine-type n1-highcpu-32 --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
for i in $(seq 1 $(nproc));
do
    sudo docker run -d --restart=always yasp/yasp:latest "node parser.js"
done
'
gcloud compute instance-groups managed create "parser-group-1" --base-instance-name "parser-group-1" --template "parser-1" --size "1"
gcloud compute instance-groups managed set-autoscaling "parser-group-1" --cool-down-period "60" --max-num-replicas "10" --min-num-replicas "1" --target-cpu-utilization "0.9"

#cassandra
#seed node
gcloud compute instances delete -q cassandra-1
gcloud compute instances create cassandra-1 --machine-type n1-highmem-2 --image container-vm --boot-disk-size 200GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
docker run --name cassandra --restart=always -d --net=host cassandra:3
'
#joining nodes
gcloud compute instance-groups managed delete -q cassandra-group-1
gcloud compute instance-templates delete -q cassandra-1
gcloud compute instance-templates create cassandra-1 --machine-type n1-highmem-2 --image container-vm --boot-disk-size 200GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
docker run --name cassandra --restart=always -d --net=host -e CASSANDRA_SEEDS=core-1 cassandra:3
'
gcloud compute instance-groups managed create "cassandra-group-1" --base-instance-name "cassandra-group-1" --template "cassandra-1" --size "1"
gcloud compute instance-groups managed set-autoscaling "cassandra-group-1" --cool-down-period "60" --max-num-replicas "10" --min-num-replicas "1" --target-cpu-utilization "0.7"

##importer
#gcloud compute instance-groups managed delete -q importer-group-1
#gcloud compute instance-templates delete -q importer-1
#gcloud compute instance-templates create importer-1 --machine-type n1-highcpu-4 --preemptible --image container-vm --metadata startup-script='#!/bin/bash
#sudo docker run -d --name importer --restart=always --net=host yasp/yasp:latest "sh -c 'node dev/allMatches.js 0 1900000000 1000 2> /dev/null'"
#'
#gcloud compute instance-groups managed create "importer-group-1" --base-instance-name "importer-group-1" --template "importer-1" --size "1"
#
##postgres maintenance
#gcloud compute instances create temp-1 --machine-type n1-standard-2 --image container-vm --disk name=temp-postgres --boot-disk-size 100GB --boot-disk-type pd-ssd