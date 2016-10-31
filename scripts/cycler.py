#!/usr/bin/python

from itertools import cycle
import subprocess
import time

def start():
  # For completeness this should also create the backend, HTTP load balancer, template, and network
  # Get the available zones
  zones = subprocess.check_output("gcloud compute zones list --format='value(NAME)'", shell=True)
  zoneList = zones.strip().split('\n')
  zoneList = sorted(zoneList)
  # sort by zone letter (last character)
  # zoneList = sorted(zoneList, key=lambda x: x[-1])
  print zoneList
  for i, zone in enumerate(zoneList):
    backendname = "retriever"
    templatename = "retriever-1"
    instancegroupname = "retriever-group-" + zone
    print i, zone, instancegroupname
    # Create the instance group
    subprocess.call("gcloud compute instance-groups managed create {} --quiet --zone={} --size=0 --template={}".format(instancegroupname, zone, templatename), shell=True)
    # Set instance template
    subprocess.call("gcloud compute instance-groups managed set-instance-template {} --quiet --zone={} --template={}".format(instancegroupname, zone, templatename), shell=True)
    # Add it to backend
    subprocess.call("gcloud compute backend-services add-backend {} --quiet --instance-group={} --instance-group-zone={}".format(backendname, instancegroupname, zone), shell=True)
    # Scale up
    subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, 2), shell=True)
    # Find the oldest instance in this group
    delete = subprocess.check_output("gcloud compute instances list --filter='name ~ ^{}' --format='value(NAME, creationTimestamp)' | sort -k 2".format(instancegroupname), shell=True)
    if (delete.startswith("retriever-group-")):
      # Delete old one
      delete = delete.split('\t')[0]
      print delete
      subprocess.call("gcloud compute instance-groups managed delete-instances {} --quiet --zone={} --instances={}".format(instancegroupname, zone, delete), shell=True)

# Handle exceptions and restart loop
while True:
  try:
    start()
  except:
    pass
  sleep(900)