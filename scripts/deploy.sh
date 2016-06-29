#!/bin/bash
for instance in `gcloud compute instance-groups managed list-instances $1-group-1 --format "value(NAME)"` ;
do
  gcloud compute instance-groups managed recreate-instances $1-group-1 --instances $instance;
  sleep ${2:-120};
done