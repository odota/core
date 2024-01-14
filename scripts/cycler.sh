#!/bin/bash

while true
do
    # Instances have a termination time limit so they'll shut down on their own
    for i in {1..3}
    do
        gcloud compute instances create retriever-$(date +%s) \
            --project=peaceful-parity-87002 \
            --zone=us-central1-b \
            --source-instance-template retriever-18 &
        sleep 1
    done
    sleep 600
done