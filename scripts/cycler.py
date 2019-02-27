#!/usr/bin/python3

from itertools import cycle
import subprocess
import time

# subprocess.call("sudo gcloud components update --quiet", shell=True)
# For completeness this should also create the backend, HTTP load balancer, template, and network
targetsize = 20
backendname = "retriever"
templatename = "retriever-9"

# Rotating single group
def run1(zoneList):
  while True:
    # Scale the instance group if it's the correct bucket
    bucketsize = 86400 // len(zoneList)
    epoch = time.time() // bucketsize
    bucket = epoch % len(zoneList)
    for i, zone in enumerate(zoneList):
      instancegroupname = "retriever-group-" + zone
      # Invert to cycle through in reverse order, so we create new instances before deleting old ones
      size = targetsize if i == (len(zoneList) - bucket - 1) else 0
      minsize = 1
      print bucket, size
      if size > 0:
        subprocess.call("gcloud compute instance-groups managed set-autoscaling {} --quiet --zone={} --min-num-replicas={} --max-num-replicas={} --scale-based-on-load-balancing --target-load-balancing-utilization=1".format(instancegroupname, zone, minsize, size), shell=True)
      else:
        subprocess.call("gcloud compute instance-groups managed stop-autoscaling {} --quiet --zone={}".format(instancegroupname, zone), shell=True)
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
    time.sleep(300)

# Rolling group
def run2(zoneList):
  pool = cycle(zoneList)
  while True:
    zone = next(pool)
    instancegroupname = "retriever-group-" + zone
    currentsize = int(subprocess.check_output("gcloud compute instance-groups managed describe {} --quiet --zone={} --format='value(targetSize)'".format(instancegroupname, zone), shell=True))
    if currentsize > 0:
      nextzone = next(pool)
      nextinstancegroupname = "retriever-group-" + nextzone
      nextsize = max(targetsize - currentsize, 0)
      subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(nextinstancegroupname, nextzone, nextsize), shell=True)
      time.sleep(300)

# Even distribution
def run3(zoneList):
  while True:
    for i, zone in enumerate(zoneList):
      instancegroupname = "retriever-group-" + zone
      #subprocess.call("gcloud compute instance-groups managed set-autoscaling {} --quiet --zone={} --min-num-replicas={} --max-num-replicas={} --scale-based-on-load-balancing".format(instancegroupname, zone, 1, targetsize), shell=True)
      subprocess.call("gcloud compute instance-groups managed stop-autoscaling {} --quiet --zone={}".format(instancegroupname, zone), shell=True)
      subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, targetsize * 2), shell=True)
      time.sleep(30)
      subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, targetsize), shell=True)
    time.sleep(2700)
    
def createGroups(zoneList):
  for i, zone in enumerate(zoneList):
    instancegroupname = "retriever-group-" + zone
    print i, zone, instancegroupname
    # Create the instance group
    subprocess.call("gcloud compute instance-groups managed create {} --quiet --zone={} --size=0 --template={}".format(instancegroupname, zone, templatename), shell=True)
    # Set instance template
    subprocess.call("gcloud compute instance-groups managed set-instance-template {} --quiet --zone={} --template={}".format(instancegroupname, zone, templatename), shell=True)
    # Add it to backend
    subprocess.call("gcloud compute backend-services add-backend {} --quiet --global --instance-group={} --instance-group-zone={}".format(backendname, instancegroupname, zone), shell=True)
    # Configure load balancing policy
    subprocess.call("gcloud compute backend-services update-backend {} --quiet --global --instance-group={} --instance-group-zone={} --balancing-mode=RATE --max-rate-per-instance=1 --capacity-scaler={}".format(backendname, instancegroupname, zone, 0.01), shell=True)
    # Scale (0 to recreate instances)
    #subprocess.call("gcloud compute instance-groups managed resize {} --quiet --zone={} --size={}".format(instancegroupname, zone, 0), shell=True)
    #subprocess.call("gcloud compute instance-groups managed stop-autoscaling {} --quiet --zone={}".format(instancegroupname, zone), shell=True)

def start():
  # Get the available zones
  zones = subprocess.check_output("gcloud compute zones list --format='value(NAME)'", shell=True)
  zoneList = zones.strip().split('\n')
  # sort by zone (alphabetical)
  # zoneList = sorted(zoneList)
  # sort by zone letter (last character)
  # zoneList = sorted(zoneList, key=lambda x: x[-1])
  zoneList = filter(lambda s: s.endswith('-b'), zoneList)
  createGroups(zoneList)
  while True:
    try:
      run1(zoneList)
      # run2(zoneList)
      # run3(zoneList)
      pass
    except KeyboardInterrupt:
      raise
    except Exception as e:
      print(e)
      time.sleep(300)

start();
