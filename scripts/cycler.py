#!/usr/bin/python

from itertools import cycle
import subprocess
import time

targetsize = 48

def cycle(zoneList):
  while True:
    # Scale the instance group if it's the correct bucket
    bucketsize = 86400 // len(zoneList)
    epoch = time.time() // bucketsize
    bucket = epoch % len(zoneList)
    for i, zone in enumerate(zoneList):
      instancegroupname = "retriever-group-" + zone
      if i == bucket:
        subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, targetsize), shell=True)
    time.sleep(60)

def cycle2(zoneList):
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
      nextsize = max(targetsize - currentsize, 0)
      subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(nextinstancegroupname, nextzone, nextsize), shell=True)
      time.sleep(60)
      
      # nextsize = int(subprocess.check_output("gcloud compute instance-groups managed describe {} --quiet --zone={} --format='value(targetSize)'".format(nextinstancegroupname, nextzone), shell=True))
      # # Scale up the next zone
      # subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(nextinstancegroupname, nextzone, nextsize + 1), shell=True)
      # # Find the oldest instance in this group
      # delete = subprocess.check_output("gcloud compute instances list --sort-by=creationTimestamp --format='table[no-heading](name)' | grep {} | head -n 1".format(instancegroupname), shell=True)
      # if (delete.startswith(instancegroupname)):
      #   # Delete old one
      #   subprocess.call("gcloud compute instance-groups managed delete-instances {} --quiet --zone={} --instances={}".format(instancegroupname, zone, delete), shell=True)
      # # Scale down the current zone
      # subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, currentsize - 1), shell=True)
      # We want to cycle fast enough that each instance lives for 20 minutes
      # time.sleep(1200 // (currentsize + nextsize))
  
def start():
  # subprocess.call("sudo gcloud components update --quiet", shell=True)
  # For completeness this should also create the backend, HTTP load balancer, template, and network
  # Get the available zones
  zones = subprocess.check_output("gcloud compute zones list --format='value(NAME)'", shell=True)
  zoneList = zones.strip().split('\n')
  # zoneList = sorted(zoneList)
  # sort by zone letter (last character)
  zoneList = sorted(zoneList, key=lambda x: x[-1])
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
    # Configure load balancing policy
    subprocess.call("gcloud compute backend-services update-backend {} --quiet --instance-group={} --instance-group-zone={} --balancing-mode=RATE --max-rate-per-instance=1".format(backendname, instancegroupname, zone), shell=True)
  cycle(zoneList)
  # cycle2(zoneList)

while True:
  try:
    start()
  except:
    pass