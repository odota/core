import config from "../config";
import axios from 'axios';
import { shuffle } from "../util/utility";

const projectId = config.GOOGLE_CLOUD_PROJECT_ID;
const lifetime = 600;
// const template = 'retriever-20';

async function getToken() {
    const tokenResponse = await axios.get("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {headers: {"Metadata-Flavor": "Google"}});
    const token = tokenResponse.data.access_token;
    return token;
}

async function cycle() {
    const zonesResponse = await axios.get(`https://compute.googleapis.com/compute/v1/projects/${projectId}/zones`, { headers: { "Authorization": "Bearer " + await getToken() }});
    const zones = zonesResponse.data.items.map((zone: any) => zone.name);
    console.log(zones, zones.length);
    while (true) {
        shuffle(zones);
        for (let i = 0; i < 3; i++) {
            const zone = zones[i % zones.length];
            const region = zone.slice(0, -2);
            const config = {
                "canIpForward": false,
                "confidentialInstanceConfig": {
                  "enableConfidentialCompute": false
                },
                "deletionProtection": false,
                "description": "",
                "disks": [
                  {
                    "autoDelete": true,
                    "boot": true,
                    "deviceName": "retriever-14",
                    "initializeParams": {
                      "diskSizeGb": "10",
                      "diskType": `projects/${projectId}/zones/${zone}/diskTypes/pd-standard`,
                      "labels": {},
                      "sourceImage": "projects/cos-cloud/global/images/cos-101-17162-336-35"
                    },
                    "mode": "READ_WRITE",
                    "type": "PERSISTENT"
                  }
                ],
                "displayDevice": {
                  "enableDisplay": false
                },
                "guestAccelerators": [],
                "instanceEncryptionKey": {},
                "keyRevocationActionType": "NONE",
                "labels": {
                  "goog-ec-src": "vm_add-rest"
                },
                "machineType": `projects/${projectId}/zones/${zone}/machineTypes/e2-micro`,
                "metadata": {
                  "items": [
                    {
                      "key": "startup-script",
                      "value": "#!/bin/bash\nsudo iptables -w -A INPUT -p tcp --dport 80 -j ACCEPT\n\n# Secrets don't need to be set since they're read from GCE metadata\nsudo docker run -d --name=retriever --net=host --log-opt max-size=1g -e PROVIDER=gce -e NODE_ENV=production -e RETRIEVER_PORT=80 -e ROLE=retriever odota/retriever:latest\n\n# If already initialized\nsudo docker start retriever\n\n# We can set a time limit for termination on GCE, but it's cancelled if we shut down manually\nsudo docker logs -f retriever\n# && sleep 5 && sudo shutdown -h now"
                    }
                  ]
                },
                "name": "retriever-" + process.hrtime.bigint(),
                "networkInterfaces": [
                  {
                    "accessConfigs": [
                      {
                        "name": "External NAT",
                        "networkTier": "PREMIUM"
                      }
                    ],
                    "stackType": "IPV4_ONLY",
                    "subnetwork": `projects/${projectId}/regions/${region}/subnetworks/global`
                  }
                ],
                "params": {
                  "resourceManagerTags": {}
                },
                "reservationAffinity": {
                  "consumeReservationType": "ANY_RESERVATION"
                },
                "scheduling": {
                  "automaticRestart": false,
                  "instanceTerminationAction": "DELETE",
                  "maxRunDuration": {
                    "seconds": lifetime.toString(),
                  },
                  "onHostMaintenance": "TERMINATE",
                  "provisioningModel": "SPOT"
                },
                "serviceAccounts": [
                  {
                    "email": "94888484309-compute@developer.gserviceaccount.com",
                    "scopes": [
                      "https://www.googleapis.com/auth/devstorage.read_only",
                      "https://www.googleapis.com/auth/logging.write",
                      "https://www.googleapis.com/auth/monitoring.write",
                      "https://www.googleapis.com/auth/service.management.readonly",
                      "https://www.googleapis.com/auth/servicecontrol",
                      "https://www.googleapis.com/auth/trace.append"
                    ]
                  }
                ],
                "shieldedInstanceConfig": {
                  "enableIntegrityMonitoring": true,
                  "enableSecureBoot": false,
                  "enableVtpm": true
                },
                "tags": {
                  "items": [
                    "http-server"
                  ]
                },
                "zone": `projects/${projectId}/zones/` + zone,
              };
              const resp = await axios.post(`https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances`, config, { headers: { "Authorization": "Bearer " + await getToken() } });
              console.log(resp.data);
        }
        await new Promise(resolve => setTimeout(resolve, lifetime * 1000 * 0.95));
    }
}

cycle();