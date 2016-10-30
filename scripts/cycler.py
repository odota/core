#!/usr/bin/python

from itertools import cycle
import subprocess
import time

def start():
  # For completeness this should also create the backend, HTTP load balancer, template, and network
  # Get the available zones
  zones = subprocess.check_output("gcloud compute zones list --format='value(NAME)'", shell=True)
  zoneList = zones.strip().split('\n')
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
  pool = cycle(zoneList)
  while True:
    # Consider all instances in each instance group connected in a chain
    # Every iteration, slide the current window one slot
    # Create the new instance in the next group first, then delete an instance in the current group
    zone = next(pool)
    instancegroupname = "retriever-group-" + zone
    currentsize = int(subprocess.check_output("gcloud compute instance-groups managed describe {} --quiet --zone={} --format='value(targetSize)'".format(instancegroupname, zone), shell=True))
    if currentsize > 0:
      nextzone = next(pool)
      nextinstancegroupname = "retriever-group-" + nextzone
      nextsize = int(subprocess.check_output("gcloud compute instance-groups managed describe {} --quiet --zone={} --format='value(targetSize)'".format(nextinstancegroupname, nextzone), shell=True))
      # Scale up the next zone
      subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(nextinstancegroupname, nextzone, nextsize + 1), shell=True)
      # Scale down the current zone
      subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, currentsize - 1), shell=True)
      # We want to cycle fast enough that each instance lives for approximately 15 minutes
      time.sleep(900 // (currentsize + nextsize))
      
while True:
  try:
    start()
  except:
    pass
  else:
    break