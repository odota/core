#!/bin/bash
gcloud compute instance-groups managed list-instances $1-group-1 --format "value(NAME)" | xargs -n1 gcloud compute instance-groups managed recreate-instances $1-group-1 --instances