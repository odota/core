// Runs all low-traffic periodic background tasks in a single process
import { statfs } from "node:fs/promises";
import type Stripe from "stripe";
import vdfparser from "vdf-parser";
import { items } from "dotaconstants";
import config from "../config.ts";
import { apps } from "../ecosystem.config.js";
import clickhouse from "./store/clickhouse.ts";
import db, { upsert, withTransaction } from "./store/db.ts";
import redis from "./store/redis.ts";
import stripe from "./store/stripe.ts";
import { addReliableJob, runInLoop } from "./store/queue.ts";
import { apiFetcher } from "./fetcher/allFetchers.ts";
import {
  getSteamAPIData,
  getSteamAPIDataWithRetry,
  SteamAPIUrls,
} from "./util/http.ts";
import { reconcileMatch } from "./util/reconcileUtil.ts";
import { getMonthRange } from "./util/time.ts";
import { epochWeek, parseJSONWithBigInts, randomInt } from "./util/utility.ts";

// Updates Steam profile data for players periodically
async function autoProfile() {
  // To optimize the api call we need to do 100 players at a time
  const { rows } = await db.query(
    "SELECT account_id from players ORDER BY profile_time ASC NULLS FIRST LIMIT 100",
  );
  console.log(rows);
  for (let row of rows) {
    await addReliableJob(
      {
        name: "profileQueue",
        data: { account_id: row.account_id },
      },
      { attempts: 1 },
    );
  }
}

// Requests history refreshes for users to fill in missing matches and update privacy setting
async function autoFh() {
  const { rows } = await db.query(
    "SELECT account_id from players ORDER BY full_history_time ASC NULLS FIRST LIMIT 5",
  );
  console.log(rows);
  for (let row of rows) {
    await addReliableJob(
      {
        name: "fhQueue",
        data: {
          account_id: row.account_id,
        },
      },
      {},
    );
  }
}

// Updates rank tier data for players periodically
async function autoMmr() {
  const { rows } = await db.query(
    "SELECT account_id from players ORDER BY rank_tier_time ASC NULLS FIRST LIMIT 25",
  );
  console.log(rows);
  for (let row of rows) {
    await addReliableJob(
      {
        name: "mmrQueue",
        data: { account_id: row.account_id },
      },
      { attempts: 1 },
    );
  }
}

// Runs background processes related to API keys and billing/usage
async function apiAdmin() {
  const options = {
    plan: config.STRIPE_API_PLAN,
    limit: 100,
    // From the docs:
    // By default, returns a list of subscriptions that have not been canceled.
    // In order to list canceled subscriptions, specify status=canceled. Use all for completeness.
    status: "all" as Stripe.Subscription.Status,
  };
  let num = 0;
  // https://stripe.com/docs/api/pagination/auto so we don't need to worry about cursors
  for await (const sub of stripe.subscriptions.list(options)) {
    num++;
    // Deactivate any keys which failed to bill
    // updateAPIKeysInRedis deletes the keys so just do that there
    if (sub.status === "canceled") {
      console.log("updateStripeUsage CANCELED SUBSCRIPTION", sub.id);
      await db.query(
        `
              UPDATE api_keys SET is_canceled = true WHERE subscription_id = $1
            `,
        [sub.id],
      );
      continue;
    }
    // Use UTC: usage rows are bucketed by start of month in web.ts,
    // so a non-UTC server timezone would otherwise select the wrong month near boundaries
    const [startTime, endTime] = getMonthRange(
      new Date((sub.current_period_end - 1) * 1000),
    );
    const res = await db.query(
      `
            SELECT
              SUM(usage) as usage_count
            FROM (
              SELECT
                api_key_usage.api_key,
                api_key_usage.ip,
                MAX(api_key_usage.usage_count) as usage
              FROM api_key_usage
              JOIN api_keys ON api_key_usage.api_key = api_keys.api_key
              WHERE
                timestamp >= $1
                AND timestamp <= $2
                AND subscription_id = $3
              GROUP BY api_key_usage.api_key, api_key_usage.ip
            ) as t1
          `,
      [startTime, endTime, sub.id],
    );
    if (res.rows.length > 0 && res.rows[0].usage_count) {
      const usageCount = res.rows[0].usage_count;
      // Set usage to be the value at end of the billing period
      // - 1 so that it's within the same month
      // TODO(albert): We could break this out by day for the invoice
      // but we'd have to make changes to web.js and metrics
      await stripe.subscriptionItems.createUsageRecord(sub.items.data[0].id, {
        quantity: Math.ceil(usageCount / Number(config.API_BILLING_UNIT)),
        action: "set",
        timestamp: sub.current_period_end - 1,
      });
      console.log(
        "updateStripeUsage updated",
        sub.id,
        usageCount,
        Math.ceil(usageCount / Number(config.API_BILLING_UNIT)),
      );
    }
  }
  console.log(`updateStripeUsage processed ${num} records`);
}

// Updates game cosmetic items in the database
async function cosmetics() {
  const itemsResp = await fetch(
    "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/items/items_game.txt",
  );
  if (!itemsResp.ok) {
    throw new Error(`Failed to fetch items_game.txt: ${itemsResp.status}`);
  }
  const itemsText = await itemsResp.text();
  const iconsResp = await fetch(
    "https://raw.githubusercontent.com/builder-247/node-dota2-cdn/main/build/icons.json",
  );
  if (!iconsResp.ok) {
    throw new Error(`Failed to fetch icons.json: ${iconsResp.status}`);
  }
  const icons = await iconsResp.json();
  const itemData = vdfparser.parse<any>(itemsText);

  const ids = Object.keys(itemData.items_game.items);
  console.log("%s cosmetics to process", ids.length);
  for (let itemId of ids) {
    const item = itemData.items_game.items[itemId];
    item.item_id = Number(itemId);
    const hero =
      item.used_by_heroes &&
      typeof item.used_by_heroes === "object" &&
      Object.keys(item.used_by_heroes)[0];
    if (hero) {
      item.used_by_heroes = hero;
    }
    if (!item.item_id) {
      return;
    }
    if (item.image_inventory) {
      const spl = item.image_inventory.split("/");
      const iconname = spl[spl.length - 1];
      if (icons[iconname]) {
        item.image_path = icons[iconname];
      }
    }
    await upsert(db, "cosmetics", item, {
      item_id: item.item_id,
    });
  }
}

// Refreshes the rank_tier_distribution materialized view periodically
async function distributions() {
  await db.query(
    "REFRESH MATERIALIZED VIEW CONCURRENTLY rank_tier_distribution",
  );
}

// Updates the heroes in the database
async function heroes() {
  const url = SteamAPIUrls.api_heroes({
    language: "english",
  });
  const body = await getSteamAPIDataWithRetry<Heroes>({ url });
  if (!body || !body.result || !body.result.heroes) {
    return;
  }
  const heroResp = await fetch(
    "https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json",
  );
  if (!heroResp.ok) {
    return;
  }
  const heroData = await heroResp.json();
  if (!heroData) {
    return;
  }
  for (let hero of body.result.heroes) {
    const heroDataHero = heroData[hero.id] || {};
    await upsert(
      db,
      "heroes",
      {
        ...hero,
        primary_attr: heroDataHero.primary_attr,
        attack_type: heroDataHero.attack_type,
        roles: heroDataHero.roles,
        legs: heroDataHero.legs,
      },
      {
        id: hero.id,
      },
    );
  }
}

// Updates game items in the database
async function doItems() {
  const url = `https://www.dota2.com/datafeed/itemlist?language=english`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch items: ${resp.status}`);
  }
  const data = await resp.json();
  const arr: any[] = data?.result?.data?.itemabilities;
  if (!arr) {
    throw new Error("invalid response");
  }
  for (let item of arr) {
    item.localized_name = item.name_english_loc;
    item.cost =
      items?.[item.name.replace(/^item_/, "") as keyof typeof items]?.cost || 0;
    item.recipe = item.name.includes("recipe") ? 1 : 0;
    // NOTE: properties secret_shop and side_shop are no longer present
    await upsert(db, "items", item, {
      id: item.id,
    });
  }
}

// Updates the list of leagues in the database
async function leagues() {
  const url =
    "http://www.dota2.com/webapi/IDOTA2League/GetLeagueInfoList/v001";
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch leagues: ${resp.status}`);
  }
  const data: Leagues = await resp.json();
  const apiLeagues: LeagueToInsert[] = data.infos;
  console.log("[LEAGUES]", apiLeagues.length, "leagues");
  for (let league of apiLeagues) {
    const openQualifierTier =
      league.name.indexOf("Open Qualifier") === -1 ? null : "excluded";
    let eventTier = "excluded";
    if (Number(league.tier) === 2) {
      eventTier = "professional";
    } else if (Number(league.tier) >= 3) {
      eventTier = "premium";
    }
    if (league.league_id === 4664) {
      eventTier = "premium";
    }
    league.tier = openQualifierTier ?? eventTier;
    league.ticket = null;
    league.banner = null;
    league.leagueid = league.league_id;
    await upsert(db, "leagues", league, {
      leagueid: league.league_id,
    });
  }
}

// Updates the list of currently live games
async function liveGames() {
  // Get the list of pro players
  const { rows: proPlayersList } = await db.query<ProPlayer>(
    "SELECT * FROM notable_players",
  );
  // Get the list of live games
  const url = SteamAPIUrls.api_top_live_game({
    partner: Math.random() < 0.5 ? 1 : 2,
  });
  const body = await getSteamAPIDataWithRetry<string>({ url, raw: true });
  const json: TopLiveGames = parseJSONWithBigInts(body);
  // If a match contains a pro player
  // add their name to the match object, save it to redis zset, keyed by server_steam_id
  for (let match of json.game_list) {
    if (match && match.players) {
      match.players.forEach((player, i) => {
        const proPlayer = proPlayersList.find(
          (proPlayer) =>
            proPlayer.account_id.toString() === player.account_id?.toString(),
        );
        if (proPlayer) {
          match.players[i] = { ...player, ...proPlayer };
        }
      });
      // convert the BigInt to a string
      match.lobby_id = match.lobby_id.toString();
      await redis.zadd("liveGames", match.lobby_id, match.lobby_id);
      await redis.setex(
        `liveGame:${match.lobby_id}`,
        28800,
        JSON.stringify(match),
      );
      // Keep only the 100 highest values
      await redis.zremrangebyrank("liveGames", "0", "-101");
    }
  }
}

// Updates the list of pro players in the database
async function proPlayers() {
  const url =
    "http://www.dota2.com/webapi/IDOTA2Fantasy/GetProPlayerInfo/v001";
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch pro players: ${resp.status}`);
  }
  const data = await resp.json();
  const apiPros = data.player_infos;
  console.log("[PROPLAYERS]", apiPros.length, "players");
  for (let p of apiPros) {
    await upsert(db, "notable_players", p, {
      account_id: p.account_id,
    });
  }
}

// Updates the list of teams in the database
async function doTeams() {
  const result = await db.query(
    "select distinct team_id from team_match TABLESAMPLE BERNOULLI(0.05)",
  );
  const result2 = await db.query(
    "select team_id from (select distinct team_id from team_match) ids where team_id not in (select team_id from teams)",
  );
  const combined = [...result2.rows, ...result.rows];
  for (let m of combined) {
    if (!m.team_id) {
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const url = SteamAPIUrls.api_team_info_by_team_id({
      start_at_team_id: m.team_id,
    });
    let raw = await getSteamAPIDataWithRetry<string>({
      url,
      raw: true,
    });
    const body = parseJSONWithBigInts(raw);
    if (!body.result || !body.result.teams) {
      continue;
    }
    let t = body.result.teams[0];
    t.team_id = m.team_id;
    // Steam's CDN sometimes has better versions of team logos available
    try {
      const cdnUrl = `https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/${m.team_id}.png`;
      // Check if it exists
      const resp = await fetch(cdnUrl, { method: "HEAD" });
      if (!resp.ok) {
        throw new Error(`CDN image not found: ${resp.status}`);
      }
      t.logo_url = cdnUrl;
    } catch {
      // This is fine, we failed to get CDN image info
      console.log("failed to get image from cdn");
    }
    if (!t.logo_url) {
      // The logo value is a 64 bit integer which is too large to represent in JSON
      // So we parse it with parseJSONWithBigInts, which keeps it as a string
      const logoUgc = t.logo;
      // Try getting image from ugc
      try {
        const ugcUrl = SteamAPIUrls.api_get_ugc_file_details({
          ugcid: logoUgc,
        });
        // This may not exist for all teams so don't retry
        const ugcBody = await getSteamAPIData<any>({
          url: ugcUrl,
        });
        if (ugcBody && ugcBody.data) {
          t.logo_url = ugcBody.data.url;
        }
      } catch (e) {
        // Continue even if we can't get a logo
        console.log("failed to get image from ugc");
      }
    }
    await upsert(db, "teams", t, {
      team_id: m.team_id,
    });
  }
}

// Cleans up old data from the database
async function cleanup() {
  const currentWeek = epochWeek();
  await db.query(
    "DELETE FROM team_scenarios WHERE epoch_week IS NULL OR epoch_week <= $1",
    [currentWeek - Number(config.MAXIMUM_AGE_SCENARIOS_ROWS)],
  );
  await db.query(
    "DELETE FROM scenarios WHERE epoch_week IS NULL OR epoch_week <= $1",
    [currentWeek - Number(config.MAXIMUM_AGE_SCENARIOS_ROWS)],
  );
  let result = await db.query(
    "DELETE from public_matches where start_time < extract(epoch from now() - interval '12 month')::int",
  );
  console.log(result.command, result.rowCount);
  result = await db.query(
    "DELETE from insert_queue where match_seq_num < (select max(match_seq_num) - 100000 from insert_queue) AND processed = TRUE",
  );
  console.log(result.command, result.rowCount);
}

// Syncs the list of subscribers from Stripe to the database
async function doSyncSubs() {
  // Get list of current subscribers
  const result: Stripe.Subscription[] = [];
  for await (const sub of stripe.subscriptions.list({
    limit: 100,
    status: "active",
    price: "price_1LE5NqCHN72mG1oKg2Y9pqXb",
  })) {
    result.push(sub);
  }
  console.log(result.length, "subs");
  await withTransaction(async (trx) => {
    // Delete all status from subscribers
    await trx.query("DELETE FROM subscriber");
    for (let sub of result) {
      let accountId = sub.metadata["account_id"];
      if (!accountId) {
        try {
          const sessions = await stripe.checkout.sessions.list({
            subscription: sub.id,
            limit: 1,
          });
          const session = sessions.data[0];
          const clientRef =
            session?.metadata?.account_id ?? session?.client_reference_id;
          if (clientRef) {
            accountId = clientRef;
            await stripe.subscriptions.update(sub.id, {
              metadata: { account_id: clientRef },
            });
            console.log(
              "Copied account_id %s to subscription %s metadata",
              clientRef,
              sub.id,
            );
          }
        } catch (err) {
          console.error(
            "Failed to copy account_id for sub %s: %s",
            sub.id,
            err,
          );
        }
      }
      if (!accountId) {
        console.error("no accountID for active customer %s", sub.customer);
      } else {
        await trx.query(
          "INSERT INTO subscriber(account_id, customer_id, status) VALUES ($1, $2, 'active') ON CONFLICT DO NOTHING",
          [Number(accountId), sub.customer],
        );
      }
    }
  });
}

// Runs health checks periodically and writes result to Redis
const health: Record<string, () => Promise<Metric>> = {
  postgresUsage: async () => {
    const result = await db.query("select pg_database_size('yasp')");
    return {
      metric: result.rows[0]?.pg_database_size,
      limit: 3.5 * 10 ** 11,
    };
  },
  redisUsage: async () => {
    const info = await redis.info();
    const line = info
      .split("\n")
      .find((line: string) => line.startsWith("used_memory"));
    return {
      metric: Number(line?.split(":")[1]),
      limit: 10 * 10 ** 9,
    };
  },
  clickhouseUsage: async () => {
    const rows = await clickhouse.query<{ size: number }>(
      `
SELECT sum(bytes_on_disk) as size
FROM system.parts
WHERE database = 'yasp' AND active;
`,
    );
    return {
      metric: Number(rows[0]?.size || 0),
      limit: 2.8 * 10 ** 12,
    };
  },
  diskUsage: async () => {
    const result = await statfs("/");
    return {
      metric: (result.blocks - result.bavail) * result.bsize,
      limit: result.blocks * result.bsize,
    };
  },
  seqNumDelay: async () => {
    const url = SteamAPIUrls.api_history({});
    const body = await getSteamAPIData<MatchHistory>({ url });
    const currSeqNum = body.result.matches[0]?.match_seq_num;
    const { rows } = await db.query(
      "select max(match_seq_num) from insert_queue;",
    );
    const numResult = Number(rows[0]?.max) || 0;
    const metric = !currSeqNum || !numResult ? 0 : currSeqNum - numResult;
    return {
      metric,
      limit: 50000,
    };
  },
  gcDelay: async () => {
    const result = await db.query(
      "select count(*) from queue where type = 'gcdata'",
    );
    return {
      metric: result.rows[0]?.count,
      limit: 50000,
    };
  },
  parseDelay: async () => {
    const result = await db.query(
      "select count(*) from queue where type = 'parse'",
    );
    return {
      metric: result.rows[0]?.count,
      limit: 50000,
    };
  },
  fhDelay: async () => {
    const result = await db.query(
      "select count(*) from queue where type = 'fhQueue'",
    );
    return {
      metric: result.rows[0]?.count,
      limit: 50000,
    };
  },
  mmrDelay: async () => {
    const result = await db.query(
      "select count(*) from queue where type = 'mmrQueue'",
    );
    return {
      metric: result.rows[0]?.count,
      limit: 50000,
    };
  },
  scenariosDelay: async () => {
    const result = await db.query(
      "select count(*) from queue where type = 'scenariosQueue'",
    );
    return {
      metric: result.rows[0]?.count,
      limit: 50000,
    };
  },
  profileDelay: async () => {
    const result = await db.query(
      "select count(*) from queue where type = 'profileQueue'",
    );
    return {
      metric: result.rows[0]?.count,
      limit: 50000,
    };
  },
  rateDelay: async () => {
    const result = await db.query("select count(*) from rating_queue");
    return {
      metric: result.rows[0]?.count,
      limit: 50000,
    };
  },
  insertDelay: async () => {
    const result = await db.query(
      "select count(*) from insert_queue WHERE processed = FALSE",
    );
    return {
      metric: result.rows[0]?.count,
      limit: 50000,
    };
  },
  countsDelay: async () => {
    const result = await db.query(
      "select count(*) from queue where type = 'counts'",
    );
    return {
      metric: result.rows[0]?.count,
      limit: 50000,
    };
  },
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

async function monitor() {
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
}

// Get a match ID with a high number of retries from player_match_history
// It probably doesn't have apidata, so backfill it with seqnum data
async function repair() {
  const { rows } = await db.query(
    "select match_id, retries from player_match_history WHERE retries >= 5 ORDER BY retries DESC NULLS LAST LIMIT 1",
  );
  const row = rows[0];
  if (row) {
    await apiFetcher.getOrFetchData(row.match_id, { seqNumBackfill: true });
    // Reconcile the match now that it's fixed
    let { rows: allRows } = await db.query(
      "select * from player_match_history where match_id = $1",
      [row.match_id],
    );
    console.log(allRows);
    await reconcileMatch(allRows, true);
  }
}

// Randomly guess match IDs and try to parse them to get gcdata and reconcile
async function autoReconcile() {
  // We don't have a full listing of valid match IDs
  // Randomly guess IDs (about 1/2 will be valid) and try to parse them
  // This will get gcdata and reconcile
  const max =
    (await db.query("select max(match_id) from public_matches"))?.rows?.[0]
      ?.max ?? 0;
  const rand = randomInt(0, max);
  await addReliableJob(
    {
      name: "parse",
      data: { match_id: rand },
    },
    {
      attempts: 1,
      priority: 9,
    },
  );
}

const tasks: [() => Promise<void>, number][] = [
  [autoProfile, 10000],
  // Fullhistory jobs can take ~5 seconds so only add new items slower than this to give queue time to drain
  [autoFh, 5000],
  [autoMmr, 5000],
  [apiAdmin, 60 * 60 * 1000],
  [cosmetics, 1 * 60 * 60 * 1000],
  [distributions, 1 * 60 * 60 * 1000],
  [heroes, 1 * 60 * 60 * 1000],
  [doItems, 1 * 60 * 60 * 1000],
  [leagues, 30 * 60 * 1000],
  [liveGames, 60 * 1000],
  [proPlayers, 30 * 60 * 1000],
  [doTeams, 30 * 60 * 1000],
  [cleanup, 1 * 60 * 60 * 1000],
  [doSyncSubs, 60 * 1000],
  [monitor, 10000],
  // [repair, 1000],
  // [autoReconcile, 10000],
];

await Promise.all(
  tasks.map(([fn, interval]) => {
    const safeFn = async () => {
      try {
        await fn();
      } catch (e) {
        console.error("[%s] error:", fn.name, e);
      }
    };
    Object.defineProperty(safeFn, "name", { value: fn.name });
    return runInLoop(safeFn, interval);
  }),
);
