import pg from "pg";
import config from "../../config.ts";
import { convert64to32, getAnonymousAccountId } from "../util/utility.ts";
import util from "node:util";

// remember: all values returned from the server are either NULL or a string
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
console.log(
  "[POSTGRES] connecting %s with %s max connections",
  config.POSTGRES_URL,
  config.POSTGRES_MAX_CONNECTIONS,
);

export const db = new pg.Pool({
  connectionString: config.POSTGRES_URL,
  application_name: `odota-${config.APP_NAME || "unknown"}`,
  statement_timeout: 60000,
  min: 0,
  max: Number(config.POSTGRES_MAX_CONNECTIONS),
});

const columns: Record<string, Record<string, boolean>> = {};

export async function upsert(
  db: pg.Pool | pg.PoolClient,
  table: string,
  insert: AnyDict,
  conflict: NumberDict,
) {
  if (!columns[table]) {
    const result = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      [table],
    );
    columns[table] = {};
    result.rows.forEach((r) => {
      columns[table][r.column_name] = true;
    });
  }
  const tableColumns = columns[table];
  const row = { ...insert };
  // Remove extra properties
  Object.keys(row).forEach((key) => {
    if (!tableColumns[key]) {
      delete row[key];
    }
  });
  const values = Object.keys(row).map((_, i) => `$${i + 1}`);
  const update = Object.keys(row).map((key) =>
    util.format("%s=%s", key, `EXCLUDED.${key}`),
  );
  const query = util.format(
    "INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s",
    table,
    Object.keys(row).join(","),
    values.join(","),
    Object.keys(conflict).join(","),
    update.join(","),
  );
  return db.query(
    query,
    Object.keys(row).map((key) => row[key]),
  );
}

export async function upsertPlayer(
  db: pg.Pool | pg.PoolClient,
  player: Partial<User>,
) {
  if (player.steamid && !player.account_id) {
    // convert steamid to accountid
    player.account_id = Number(convert64to32(player.steamid));
  }
  if (!player.account_id || player.account_id === getAnonymousAccountId()) {
    return;
  }
  const result = await upsert(db, "players", player, {
    account_id: player.account_id,
  });
  if (player.personaname != null) {
    await db.query(
      `INSERT INTO player_names(account_id, personaname)
       VALUES($1, $2)
       ON CONFLICT(account_id) DO UPDATE SET personaname = EXCLUDED.personaname
       WHERE player_names.personaname IS DISTINCT FROM EXCLUDED.personaname`,
      [player.account_id, player.personaname],
    );
  }
  return result;
}

export function getLogChannel(channel: string) {
  const normalized = /^\d+$/.test(channel) ? `job_${channel}` : channel;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(normalized)) {
    throw new Error(`Invalid notification channel: ${channel}`);
  }
  return normalized;
}

export async function publishLog(channel: string, message: string) {
  try {
    await db.query("SELECT pg_notify($1, $2)", [
      getLogChannel(channel),
      message.slice(0, 7500),
    ]);
  } catch (e) {
    console.log(e);
  }
}

type LogListener = (payload: string) => void;
const logChannelListeners = new Map<string, Set<LogListener>>();
let listenClient: pg.Client | null = null;
let listenConnectPromise: Promise<pg.Client> | null = null;
let listenReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleListenReconnect() {
  if (logChannelListeners.size > 0 && !listenReconnectTimer) {
    listenReconnectTimer = setTimeout(async () => {
      listenReconnectTimer = null;
      if (logChannelListeners.size > 0) {
        try {
          await getListenClient();
        } catch (err) {
          console.log("[LOGS] pg listen reconnect failed:", err);
          scheduleListenReconnect();
        }
      }
    }, 1000);
  }
}

function resetListenClient(client: pg.Client) {
  if (listenClient !== client) {
    return;
  }
  listenClient = null;
  scheduleListenReconnect();
}

async function getListenClient(): Promise<pg.Client> {
  if (listenClient) {
    return listenClient;
  }
  if (!listenConnectPromise) {
    listenConnectPromise = (async () => {
      try {
        const client = new pg.Client({
          connectionString: config.POSTGRES_URL,
          application_name: `odota-${config.APP_NAME || "unknown"}-logs`,
        });
        client.on("notification", (msg) => {
          const listeners = logChannelListeners.get(msg.channel);
          if (!listeners) {
            return;
          }
          const payload = msg.payload ?? "";
          for (const listener of listeners) {
            listener(payload);
          }
        });
        client.on("error", (err) => {
          console.log("[LOGS] pg listen client error:", err);
          resetListenClient(client);
        });
        client.on("end", () => {
          resetListenClient(client);
        });
        await client.connect();
        listenClient = client;
        // Re-subscribe any active channels (e.g. after reconnect)
        for (const channel of logChannelListeners.keys()) {
          await client.query(`LISTEN ${channel}`);
        }
        return client;
      } finally {
        listenConnectPromise = null;
      }
    })();
  }
  return listenConnectPromise;
}

export async function subscribeLogs(
  rawChannels: string[],
  listener: LogListener,
): Promise<() => Promise<void>> {
  const channels = Array.from(new Set(rawChannels.map(getLogChannel)));
  const client = await getListenClient();
  for (const channel of channels) {
    let listeners = logChannelListeners.get(channel);
    const isFirst = !listeners || listeners.size === 0;
    if (!listeners) {
      listeners = new Set();
      logChannelListeners.set(channel, listeners);
    }
    listeners.add(listener);
    if (isFirst) {
      await client.query(`LISTEN ${channel}`);
    }
  }
  let closed = false;
  return async () => {
    if (closed) {
      return;
    }
    closed = true;
    for (const channel of channels) {
      const listeners = logChannelListeners.get(channel);
      if (!listeners) {
        continue;
      }
      listeners.delete(listener);
      if (listeners.size === 0) {
        logChannelListeners.delete(channel);
        if (listenClient) {
          try {
            await listenClient.query(`UNLISTEN ${channel}`);
          } catch {}
        }
      }
    }
  };
}

export async function withTransaction<T>(
  fn: (trx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const trx = await db.connect();
  let releaseErr: any;
  try {
    await trx.query("BEGIN");
    const result = await fn(trx);
    await trx.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await trx.query("ROLLBACK");
    } catch (rollbackErr) {
      releaseErr = rollbackErr;
    }
    throw e;
  } finally {
    trx.release(releaseErr);
  }
}

export default db;
