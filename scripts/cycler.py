#!/usr/bin/python

from itertools import cycle
import subprocess
import time

# subprocess.call("sudo gcloud components update --quiet", shell=True)
# For completeness this should also create the backend, HTTP load balancer, template, and network
targetsize = 32
backendname = "retriever"
templatename = "retriever-1"

def cycle(zoneList):
  while True:
    # Scale the instance group if it's the correct bucket
    bucketsize = 86400 // len(zoneList)
    epoch = time.time() // bucketsize
    bucket = epoch % len(zoneList)
    for i, zone in enumerate(zoneList):
      instancegroupname = "retriever-group-" + zone
      size = targetsize if i == bucket else 0
      subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, size), shell=True)
      # if size > 0:
      #   # Iterate over instances in the group
      #   instancesCmd = "gcloud compute instance-groups managed list-instances {} --zone={} --format='value(NAME)'".format(instancegroupname, zone);
      #   # print instancesCmd
      #   instances = subprocess.check_output(instancesCmd, shell=True)
      #   instanceList = instances.strip().split('\n')
      #   for i, instance in enumerate(instanceList):
      #     # Delete access config
      #     subprocess.call("gcloud compute instances delete-access-config {} --quiet --access-config-name={} --zone={}".format(instance, "external-nat", zone), shell=True)
      #     # Wait a while
      #     time.sleep(900 / targetsize)
      #     # Use ephemeral IP
      #     subprocess.call("gcloud compute instances add-access-config {} --access-config-name={} --zone={}".format(instance, "external-nat", zone), shell=True)
    time.sleep(600)

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

def cycle3(zoneList):
  while True:
    for i, zone in enumerate(zoneList):
      instancegroupname = "retriever-group-" + zone
      # Scale to 0
      subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, 0), shell=True)
      # Scale to 2
      subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, 2), shell=True)
      # Delete the static IP
      # subprocess.call("gcloud compute addresses delete {} --quiet --region={}".format(zone, zone[:-2]), shell=True)
      # Create a static IP
      # subprocess.call("gcloud compute addresses create {} --region={}".format(zone, zone[:-2]), shell=True)
      # Iterate over instances in the group
      instancesCmd = "gcloud compute instance-groups managed list-instances {} --zone={} --format='value(NAME)'".format(instancegroupname, zone);
      # print instancesCmd
      instances = subprocess.check_output(instancesCmd, shell=True)
      instanceList = instances.strip().split('\n')
      for i, instance in enumerate(instanceList):
        # Delete access config
        subprocess.call("gcloud compute instances delete-access-config {} --quiet --access-config-name={} --zone={}".format(instance, "external-nat", zone), shell=True)
        # Use static IP
        # subprocess.call("gcloud compute instances add-access-config {} --access-config-name={} --address={} --zone={}".format(instance, "external-nat", zone, zone), shell=True)
        # Delete access config
        # subprocess.call("gcloud compute instances delete-access-config {} --quiet --access-config-name={} --zone={}".format(instance, "external-nat", zone), shell=True)
        # Use ephemeral IP
        subprocess.call("gcloud compute instances add-access-config {} --access-config-name={} --zone={}".format(instance, "external-nat", zone), shell=True)
        # Restart the instance
        # subprocess.call("gloud compute instances reset {} --quiet --zone={}".format(instance, zone), shell=True)
      # Delete the static IP
      # subprocess.call("gcloud compute addresses delete {} --quiet --region={}".format(zone, zone[:-2]), shell=True)
    time.sleep(600)

def createGroups(zoneList):
  for i, zone in enumerate(zoneList):
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
    
def start():
  # Get the available zones
  zones = subprocess.check_output("gcloud compute zones list --format='value(NAME)'", shell=True)
  zoneList = zones.strip().split('\n')
  # sort by zone (alphabetical)
  # zoneList = sorted(zoneList)
  # sort by zone letter (last character)
  zoneList = sorted(zoneList, key=lambda x: x[-1])
  # zoneList = ['asia-east1-b', 'asia-northeast1-b', 'europe-west1-b', 'us-central1-b', 'us-east1-b', 'us-west1-b']
  createGroups(zoneList)
  cycle(zoneList)
  # cycle2(zoneList)
  # cycle3(zoneList)
  
# start()

while True:
  try:
    start()
  except:
    pass