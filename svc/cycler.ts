import config from "../config.ts";
import { parseEnv } from "node:util";
import { runInLoop, shuffle } from "./util/utility.ts";

const resp = await fetch(
  `https://compute.googleapis.com/compute/v1/projects/${config.GOOGLE_CLOUD_PROJECT_ID}/zones`,
  { headers: { Authorization: "Bearer " + (await getToken()) } },
);
if (!resp.ok) {
  throw new Error("fetch not ok");
}
const zonesJson = await resp.json();
const zones = zonesJson.items.map((zone: any) => zone.name);
console.log(zones, zones.length);
shuffle(zones);
let i = 0;

await runInLoop(async function cycler() {
  // Fetch config on each run so we can update without restarting
  let resp = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/project/attributes/env",
    {
      headers: {
        "Metadata-Flavor": "Google",
      },
    },
  );
  if (!resp.ok) {
    throw new Error("fetch not ok");
  }
  // We have to parse the file directly because pm2 caches process.env
  // https://github.com/Unitech/pm2/issues/3192
  const {
    CYCLER_COUNT,
    RETRIEVER_MIN_UPTIME,
    GOOGLE_CLOUD_RETRIEVER_TEMPLATE,
  } = parseEnv(await resp.text());
  if (
    !config.GOOGLE_CLOUD_PROJECT_ID ||
    !GOOGLE_CLOUD_RETRIEVER_TEMPLATE ||
    !RETRIEVER_MIN_UPTIME
  ) {
    throw new Error("[CYCLER] missing required config");
  }
  console.log(
    CYCLER_COUNT,
    RETRIEVER_MIN_UPTIME,
    GOOGLE_CLOUD_RETRIEVER_TEMPLATE,
  );
  const lifetime = Number(RETRIEVER_MIN_UPTIME);
  const count = Number(CYCLER_COUNT);
  // Start with a base number for gcdata/rater reqs and add additional retrievers based on parser capacity
  // Each retriever handles about 1 req/sec so divide by the avg number of seconds per parse
  // const count = Math.ceil((await getCapacity()) / 12) + 5;
  const zone = zones[i % zones.length];
  i += 1;
  const options = {
    name: "retriever-" + process.hrtime.bigint(),
    scheduling: {
      automaticRestart: false,
      instanceTerminationAction: "DELETE",
      maxRunDuration: {
        seconds: lifetime.toString(),
      },
      onHostMaintenance: "TERMINATE",
      provisioningModel: "SPOT",
    },
    zone: `projects/${config.GOOGLE_CLOUD_PROJECT_ID}/zones/` + zone,
  };
  resp = await fetch(
    `https://compute.googleapis.com/compute/v1/projects/${config.GOOGLE_CLOUD_PROJECT_ID}/zones/${zone}/instances?sourceInstanceTemplate=global/instanceTemplates/${GOOGLE_CLOUD_RETRIEVER_TEMPLATE}`,
    {
      method: "POST",
      body: JSON.stringify(options),
      headers: { Authorization: "Bearer " + (await getToken()) },
    },
  );
  console.log(resp.status, await resp.json());
  if (resp.ok) {
    await new Promise((resolve) =>
      setTimeout(resolve, (lifetime * 0.95 * 1000) / count),
    );
  } else {
    // Try the next one
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}, 0);

async function getToken() {
  const resp = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
  );
  const tokenJson = await resp.json();
  const token = tokenJson.access_token;
  return token;
}
