#deploy
DATETIME=$(date +%s)

if [ "$1" = "parser" ] || [[ $# -eq 0 ]]; then
gcloud compute instance-templates create parser-$DATETIME --machine-type n1-highcpu-32 --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
for i in $(seq 1 $(nproc));
do
    sudo docker run -d --restart=always yasp/yasp:latest "node parser.js"
done
'
gcloud alpha compute rolling-updates start --group parser-group-1 --template parser-$DATETIME
fi

if [ "$1" = "backend" ] || [[ $# -eq 0 ]]; then
gcloud compute instance-templates create backend-$DATETIME --machine-type n1-standard-2 --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --tags "http-server" --metadata startup-script='#!/bin/bash
sudo docker run -d --name yasp --restart=always --net=host yasp/yasp:latest "node deploy.js core"
'
gcloud alpha compute rolling-updates start --group backend-group-1 --template backend-$DATETIME
fi

if [ "$1" = "web" ] || [[ $# -eq 0 ]]; then
gcloud compute instance-templates create web-$DATETIME --machine-type g1-small --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --tags "http-server" --metadata startup-script='#!/bin/bash
sudo docker run -d --restart=always --net=host -e FRONTEND_PORT=80 yasp/yasp:latest "node web.js"
'
gcloud alpha compute rolling-updates start --group web-group-1 --template web-$DATETIME --min-instance-update-time 60
fi

gcloud alpha compute rolling-updates list