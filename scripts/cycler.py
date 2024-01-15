#!/usr/bin/python3

from itertools import cycle
import subprocess
import time
import random

lifetime = 360
template = "retriever-20"
cmd = '''gcloud beta compute instances create retriever-$(date +%s%N) \
            --project=peaceful-parity-87002 \
            --zone={} \
            --max-run-duration={}s \
            --instance-termination-action=DELETE \
            --source-instance-template {}
'''

def start():
  # Get the available zones
  zones = subprocess.check_output("gcloud compute zones list --format='value(NAME)'", shell=True).decode("utf-8")
  zoneList = zones.strip().split('\n')
  # zoneList = sorted(zoneList)
  # zoneList = list(filter(lambda s: s.startswith('us-') or s.startswith('northamerica-') , zoneList))
  while True:
    random.shuffle(zoneList)
    for i in range(3):
      zone = zoneList[i]
      command = cmd.format(zone, lifetime, template)
      print(command)
      try:
        subprocess.call(command, shell=True)
      except Exception as e:
        print(e)
    try:
      # wait the instance lifetime and then start new instances
      # go a little early to get new IP
      time.sleep(lifetime * 0.95)
    except KeyboardInterrupt:
      raise

start()