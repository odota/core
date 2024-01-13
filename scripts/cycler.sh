#!/bin/bash

while true
do
gcloud compute instances create retriever-$(date +%s) \
    --project=peaceful-parity-87002 \
    --zone=us-central1-b \
    --source-instance-template retriever-17
sleep 600
done