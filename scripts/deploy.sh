#deploy
DATETIME=$(date +%s)

if [ "$1" = "parser" ] || [[ $# -eq 0 ]]; then
gcloud compute instance-templates create parser-$DATETIME --machine-type n1-highcpu-2 --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
sudo docker run -d --restart=always -e PROVIDER=gce -e ROLE=parser yasp/yasp:latest sh -c "node deploy.js"
'
gcloud alpha compute rolling-updates start --group parser-group-1 --template parser-$DATETIME
fi

if [ "$1" = "backend" ] || [[ $# -eq 0 ]]; then
gcloud compute instance-templates create backend-$DATETIME --machine-type n1-highcpu-4 --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --tags "http-server" --metadata startup-script='#!/bin/bash
sudo docker run -d --name yasp --restart=always --net=host -e PROVIDER=gce yasp/yasp:latest sh -c "node deploy.js core"
'
gcloud alpha compute rolling-updates start --group backend-group-1 --template backend-$DATETIME
fi

if [ "$1" = "web" ] || [[ $# -eq 0 ]]; then
gcloud compute instance-templates create web-$DATETIME --machine-type g1-small --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --tags "http-server" --metadata startup-script='#!/bin/bash
sudo docker run -d --restart=always --net=host -e FRONTEND_PORT=80 -e PROVIDER=gce -e ROLE=web yasp/yasp:latest sh -c "node deploy.js"
'
gcloud alpha compute rolling-updates start --group web-group-1 --template web-$DATETIME --min-instance-update-time 180
fi

gcloud alpha compute rolling-updates list