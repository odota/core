gcloud compute project-info add-metadata --metadata-from-file env=./prod.env
gcloud compute instance-templates create core-1 --machine-type n1-highmem-8 --image container-vm --disk name=disk-redis --disk name=disk-postgres --metadata startup-script='#!/bin/bash
git clone https://github.com/yasp-dota/yasp
sudo mkdir /var/lib/redis
sudo mount -o defaults /dev/sdb /var/lib/redis
sudo mkdir /var/lib/postgresql/data
sudo mount -o defaults /dev/sdc /var/lib/postgresql/data
sudo curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /.env
#configure nginx (point port 80 to 5000)
sudo docker run -d --net=host -v /.env:/usr/src/yasp/.env yasp/yasp:latest "node ./deploy.js && sleep infinity"
sudo docker run -d -v /yasp/cluster/setup:/etc/redis -v /var/lib/redis:/var/lib/redis --net=host redis:3 redis-server /etc/redis/redis.conf
sudo docker run -d -e "PGDATA=/var/lib/postgresql/data/pgdata" -v /var/lib/postgresql/data:/var/lib/postgresql/data -v /yasp/cluster/setup:/etc/postgresql --net=host postgres:9.5 postgres --config_file=/etc/postgresql/postgresql.conf
'
gcloud compute --project "peaceful-parity-87002" instance-groups managed create "core-group-1" --zone "us-central1-b" --base-instance-name "core-group-1" --template "core-1" --size "1"

gcloud compute project-info add-metadata --metadata-from-file env=./prod.env
gcloud compute instance-templates create parser-1 --machine-type n1-highcpu-2   --image container-vm   --preemptible --metadata startup-script='#!/bin/bash
sudo curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /.env
sudo docker run -d --net=host -v /.env:/usr/src/yasp/.env yasp/yasp:latest "./node_modules/pm2/bin/pm2 start parser.js -i 0 && sleep infinity"
'
gcloud compute --project "peaceful-parity-87002" instance-groups managed create "parser-group-1" --zone "us-central1-b" --base-instance-name "parser-group-1" --template "parser-1" --size "1"
gcloud compute --project "peaceful-parity-87002" instance-groups managed set-autoscaling "parser-group-1" --zone "us-central1-b" --cool-down-period "60" --max-num-replicas "30" --min-num-replicas "1" --target-cpu-utilization "0.8"