#deploy
UNIX_TIME=$(date +%s)
gcloud compute instance-templates create parser-$UNIX_TIME --machine-type n1-highcpu-4 --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --metadata startup-script='#!/bin/bash
for i in $(seq 1 $(nproc));
do
    sudo docker run -d --restart=always yasp/yasp:latest "node parser.js"
done
'
gcloud alpha compute rolling-updates start --group parser-group-1 --template parser-$UNIX_TIME
gcloud compute instance-templates create backend-$UNIX_TIME --machine-type n1-highcpu-4 --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --tags "http-server" --metadata startup-script='#!/bin/bash
sudo docker run -d --name yasp --restart=always --net=host yasp/yasp:latest "node deploy.js core"
'
gcloud alpha compute rolling-updates start --group backend-group-1 --template backend-$UNIX_TIME
gcloud compute instance-templates create web-$UNIX_TIME --machine-type g1-small --image container-vm --preemptible --boot-disk-size 10GB --boot-disk-type pd-ssd --tags "http-server" --metadata startup-script='#!/bin/bash
sudo docker run -d --restart=always --net=host -e FRONTEND_PORT=80 yasp/yasp:latest "node web.js"
'
gcloud alpha compute rolling-updates start --group web-group-1 --template web-$UNIX_TIME --min-instance-update-time 60
gcloud alpha compute rolling-updates list