#!/usr/bin/python

import subprocess
import time

# For completeness this should also create the backend and the HTTP load balancer
while True:
  # Get the available zones
  zones = subprocess.check_output("gcloud compute zones list --format='value(NAME)'", shell=True)
  zoneList = zones.strip().split('\n')
  # sort by zone ID
  zoneList = sorted(zoneList, key=lambda x: x[-1])
  for i, zone in enumerate(zoneList):
    backendname = "retriever"
    templatename = "retriever-2"
    instancegroupname = "retriever-group-" + zone
    print i, zone, instancegroupname
    # Create the instance group
    subprocess.call("gcloud compute instance-groups managed create {} --quiet --zone={} --size=0 --template={}".format(instancegroupname, zone, templatename), shell=True)
    # Set instance template
    subprocess.call("gcloud compute instance-groups managed set-instance-template {} --quiet --zone={} --template={}".format(instancegroupname, zone, templatename), shell=True)
    # Add it to backend
    subprocess.call("gcloud compute backend-services add-backend {} --quiet --instance-group={} --instance-group-zone={}".format(backendname, instancegroupname, zone), shell=True)
    # Scale the instance group if it's the correct bucket
    bucketsize = 86400 // len(zoneList)
    unixhour = time.time() // bucketsize
    bucket = unixhour % len(zoneList)
    size = 24 if i == bucket else 0
    print unixhour, bucket, size
    subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, size), shell=True)
  # Wait half a bucket and redo
  time.sleep(bucketsize // 2)