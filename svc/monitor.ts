// Runs health checks periodically and writes result to Redis
import redis from "./store/redis.ts";
import db from "./store/db.ts";
import cassandra from "./store/cassandra.ts";
import { runInLoop } from "./util/utility.ts";
import { apps } from "../ecosystem.config.js";
import { config } from "../config.ts";
import { getSteamAPIData, SteamAPIUrls } from "./util/http.ts";
import { statfs } from "node:fs/promises";

const health: Record<string, () => Promise<Metric>> = {
  // steamApi,
  postgresUsage,
  redisUsage,
  cassandraUsage,
  diskUsage,
  seqNumDelay,
  parseDelay,
  fhDelay,
  mmrDelay,
  cacheDelay,
  scenariosDelay,
  profileDelay,
  rateDelay,
  insertDelay,
};

// Get list of backend processes
apps.forEach((app) => {
  // Add a check for each's health status
  if (!app.health_exempt) {
    health[app.name] = async () => {
      // processes refresh keys as they run
      // Store the duration of the run
      // Set expire to HEALTH_TIMEOUT, so can use TTL to find the timestamp
      const run = await redis.get("lastRun:" + app.name);
      const limit = Number(config.HEALTH_TIMEOUT);
      const metric = run ? Math.floor(Number(run) / 1000) : limit;
      return {
        metric,
        limit,
      };
    };
  }
});

await runInLoop(async function monitor() {
  const result: Record<string, Metric> = {};
  for (let [key, value] of Object.entries(health)) {
    let final: Metric = {
      metric: 1,
      limit: 1,
      timestamp: Math.floor(Date.now() / 1000),
    };
    try {
      final = await value();
      final.timestamp = Math.floor(Date.now() / 1000);
      console.log("[%s]: %s", key, JSON.stringify(final));
    } catch (e) {
      console.log("[%s] error: %s", key, e);
    }
    result[key] = final;
  }
  await redis.set("health:v2", JSON.stringify(result));
  await redis.expire("health:v2", 900);
}, 10000);

async function seqNumDelay() {
  const url = SteamAPIUrls.api_history({});
  const body = await getSteamAPIData<MatchHistory>({ url });
  const currSeqNum = body.result.matches[0]?.match_seq_num;
  const { rows } = await db.raw("select max(match_seq_num) from insert_queue;");
  const numResult = Number(rows[0]?.max) || 0;
  let metric;
  if (!currSeqNum || !numResult) {
    metric = 0;
  } else {
    // get match_seq_num, compare with real seqnum
    metric = currSeqNum - numResult;
  }
  return {
    metric,
    limit: 50000,
  };
}
async function parseDelay() {
  const result = await db.raw(
    "select count(*) from queue where type = 'parse'",
  );
  return {
    metric: result.rows[0]?.count,
    limit: 50000,
  };
}
async function fhDelay() {
  const result = await db.raw(
    "select count(*) from queue where type = 'fhQueue'",
  );
  return {
    metric: result.rows[0]?.count,
    limit: 50000,
  };
}
async function mmrDelay() {
  const result = await redis.scard("mmrQueue");
  return {
    metric: result,
    limit: 50000,
  };
}
async function cacheDelay() {
  const result = await db.raw(
    "select count(*) from queue where type = 'cacheQueue'",
  );
  return {
    metric: result.rows[0]?.count,
    limit: 50000,
  };
}
async function scenariosDelay() {
  const result = await db.raw(
    "select count(*) from queue where type = 'scenariosQueue'",
  );
  return {
    metric: result.rows[0]?.count,
    limit: 50000,
  };
}
async function profileDelay() {
  const result = await redis.scard("profileQueue");
  return {
    metric: result,
    limit: 50000,
  };
}
async function rateDelay() {
  const result = await db.raw("select count(*) from rating_queue");
  return {
    metric: result.rows[0]?.count,
    limit: 50000,
  };
}
async function insertDelay() {
  const result = await db.raw(
    "select count(*) from insert_queue WHERE processed = FALSE",
  );
  return {
    metric: result.rows[0]?.count,
    limit: 50000,
  };
}
async function postgresUsage() {
  const result = await db.raw("select pg_database_size('yasp')");
  return {
    metric: result.rows[0]?.pg_database_size,
    limit: 3.5 * 10 ** 11,
  };
}
async function cassandraUsage() {
  const result = await cassandra.execute(
    `
SELECT sum(mebibytes) * 1048576 as size
FROM system_views.disk_usage
WHERE keyspace_name = 'yasp';
`,
  );
  return {
    metric: result.rows[0]?.size,
    limit: 6 * 10 ** 12,
  };
}
async function diskUsage() {
  const result = await statfs("/");
  return {
    metric: (result.blocks - result.bavail) * result.bsize,
    limit: result.blocks * result.bsize,
  };
}
async function redisUsage() {
  const info = await redis.info();
  const line = info
    .split("\n")
    .find((line: string) => line.startsWith("used_memory"));
  return {
    metric: Number(line?.split(":")[1]),
    limit: 3 * 10 ** 9,
  };
}
