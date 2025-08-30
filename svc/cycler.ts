import config from '../config';
import redis from './store/redis';
import axios from 'axios';
import { shuffle } from './util/utility';

const { PARSER_PARALLELISM } = config;
const projectId = config.GOOGLE_CLOUD_PROJECT_ID;
const lifetime = 600;
const template = 'retriever-20250324';

async function getToken() {
  const tokenResponse = await axios.get(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  const token = tokenResponse.data.access_token;
  return token;
}

async function getCapacity() {
  if (config.USE_SERVICE_REGISTRY) {
    return redis.zcard('registry:parser');
  }
  return Number(PARSER_PARALLELISM);
}

async function cycle() {
  const zonesResponse = await axios.get(
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones`,
    { headers: { Authorization: 'Bearer ' + (await getToken()) } },
  );
  const zones = zonesResponse.data.items.map((zone: any) => zone.name);
  console.log(zones, zones.length);
  while (true) {
    // Start with a base number for gcdata/rater reqs and add additional retrievers based on parser capacity
    // Each retriever handles about 1 req/sec so divide by the avg number of seconds per parse
    const count = Math.ceil((await getCapacity()) / 24) + 2;
    shuffle(zones);
    const zone = zones[0];
    const config = {
      name: 'retriever-' + process.hrtime.bigint(),
      scheduling: {
        automaticRestart: false,
        instanceTerminationAction: 'DELETE',
        maxRunDuration: {
          seconds: lifetime.toString(),
        },
        onHostMaintenance: 'TERMINATE',
        provisioningModel: 'SPOT',
      },
      zone: `projects/${projectId}/zones/` + zone,
    };
    const resp = await axios.post(
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances?sourceInstanceTemplate=global/instanceTemplates/${template}`,
      config,
      { headers: { Authorization: 'Bearer ' + (await getToken()) } },
    );
    console.log(resp.data);
    await new Promise((resolve) =>
      setTimeout(resolve, (lifetime * 0.95 * 1000) / count),
    );
  }
}

cycle();
