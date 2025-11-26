import config, { fetchConfig } from '../config.ts';
import redis from './store/redis.ts';
import axios from 'axios';
import { runInLoop, shuffle } from './util/utility.ts';

const zonesResponse = await axios.get(
  `https://compute.googleapis.com/compute/v1/projects/${config.GOOGLE_CLOUD_PROJECT_ID}/zones`,
  { headers: { Authorization: 'Bearer ' + (await getToken()) } },
);
const zones = zonesResponse.data.items.map((zone: any) => zone.name);
console.log(zones, zones.length);
shuffle(zones);
let i = 0;

runInLoop(async function cycler() {
  // Reload the config on each run
  const {
    CYCLER_COUNT,
    RETRIEVER_MIN_UPTIME,
    GOOGLE_CLOUD_RETRIEVER_TEMPLATE,
  } = await fetchConfig(true);
  if (
    !config.GOOGLE_CLOUD_PROJECT_ID ||
    !GOOGLE_CLOUD_RETRIEVER_TEMPLATE ||
    !RETRIEVER_MIN_UPTIME
  ) {
    throw new Error('[CYCLER] missing required config');
  }
  console.log(CYCLER_COUNT, RETRIEVER_MIN_UPTIME, GOOGLE_CLOUD_RETRIEVER_TEMPLATE);
  const lifetime = Number(RETRIEVER_MIN_UPTIME);
  const count = Number(CYCLER_COUNT);
  // Start with a base number for gcdata/rater reqs and add additional retrievers based on parser capacity
  // Each retriever handles about 1 req/sec so divide by the avg number of seconds per parse
  // const count = Math.ceil((await getCapacity()) / 12) + 5;
  const zone = zones[i % zones.length];
  i += 1;
  const options = {
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
    zone: `projects/${config.GOOGLE_CLOUD_PROJECT_ID}/zones/` + zone,
  };
  try {
    const resp = await axios.post(
      `https://compute.googleapis.com/compute/v1/projects/${config.GOOGLE_CLOUD_PROJECT_ID}/zones/${zone}/instances?sourceInstanceTemplate=global/instanceTemplates/${GOOGLE_CLOUD_RETRIEVER_TEMPLATE}`,
      options,
      { headers: { Authorization: 'Bearer ' + (await getToken()) } },
    );
    console.log(resp.data);
    await new Promise((resolve) =>
      setTimeout(resolve, (lifetime * 0.95 * 1000) / count),
    );
  } catch (e) {
    // Try the next one
    console.log(e);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}, 0);

async function getToken() {
  const tokenResponse = await axios.get(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  const token = tokenResponse.data.access_token;
  return token;
}
