import db from "./db.ts";
import { getStartOfBlockMinutes } from "../util/time.ts";

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function toBuffer(val: string | number | Buffer): Buffer {
  return Buffer.isBuffer(val) ? val : Buffer.from(String(val), "utf8");
}

function parseScoreBound(bound: string | number): {
  value: number | null;
  exclusive: boolean;
} {
  if (typeof bound === "number") {
    return { value: bound, exclusive: false };
  }
  const s = String(bound).trim();
  if (s === "-inf" || s === "inf" || s === "+inf") {
    return { value: null, exclusive: false };
  }
  if (s.startsWith("(")) {
    return { value: Number(s.slice(1)), exclusive: true };
  }
  return { value: Number(s), exclusive: false };
}

function buildScoreCondition(
  min: string | number,
  max: string | number,
  params: any[],
): string {
  const clauses: string[] = [];
  const minB = parseScoreBound(min);
  const maxB = parseScoreBound(max);
  if (minB.value !== null && !Number.isNaN(minB.value)) {
    params.push(minB.value);
    clauses.push(`score ${minB.exclusive ? ">" : ">="} $${params.length}`);
  }
  if (maxB.value !== null && !Number.isNaN(maxB.value)) {
    params.push(maxB.value);
    clauses.push(`score ${maxB.exclusive ? "<" : "<="} $${params.length}`);
  }
  return clauses.length ? ` AND ${clauses.join(" AND ")}` : "";
}

class PgMulti {
  private ops: (() => Promise<any>)[] = [];
  private client: PgKvClient;

  constructor(client: PgKvClient) {
    this.client = client;
  }

  del(...keys: string[]) {
    this.ops.push(() => this.client.del(...keys));
    return this;
  }

  zadd(key: string, ...args: (string | number)[]) {
    this.ops.push(() => this.client.zadd(key, ...args));
    return this;
  }

  hincrby(key: string, field: string, increment: number) {
    this.ops.push(() => this.client.hincrby(key, field, increment));
    return this;
  }

  expire(key: string, seconds: number | string) {
    this.ops.push(() => this.client.expire(key, seconds));
    return this;
  }

  expireat(key: string, timestamp: number | string) {
    this.ops.push(() => this.client.expireat(key, timestamp));
    return this;
  }

  set(
    key: string,
    value: string | number | Buffer,
    ...args: (string | number)[]
  ) {
    this.ops.push(() => this.client.set(key, value, ...args));
    return this;
  }

  setex(
    key: string,
    seconds: string | number,
    value: string | number | Buffer,
  ) {
    this.ops.push(() => this.client.setex(key, seconds, value));
    return this;
  }

  incr(key: string) {
    this.ops.push(() => this.client.incr(key));
    return this;
  }

  incrby(key: string, increment: number) {
    this.ops.push(() => this.client.incrby(key, increment));
    return this;
  }

  async exec(): Promise<[Error | null, any][]> {
    const results: [Error | null, any][] = [];
    for (const op of this.ops) {
      try {
        const res = await op();
        results.push([null, res]);
      } catch (e) {
        results.push([e as Error, null]);
      }
    }
    return results;
  }
}

class PgKvClient {
  multi() {
    return new PgMulti(this);
  }

  async get(key: string): Promise<string | null> {
    const buf = await this.getBuffer(key);
    return buf === null ? null : buf.toString("utf8");
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    const { rows } = await db.query(
      "SELECT val FROM kv_store WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)",
      [key, nowSec()],
    );
    if (!rows.length || rows[0].val === null) {
      return null;
    }
    return Buffer.isBuffer(rows[0].val)
      ? rows[0].val
      : Buffer.from(rows[0].val);
  }

  async mget(...args: (string | string[])[]): Promise<(string | null)[]> {
    const keys = args.flat();
    if (!keys.length) {
      return [];
    }
    const { rows } = await db.query(
      "SELECT key, val FROM kv_store WHERE key = ANY($1) AND (expires_at IS NULL OR expires_at > $2)",
      [keys, nowSec()],
    );
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.val !== null) {
        const buf = Buffer.isBuffer(r.val) ? r.val : Buffer.from(r.val);
        map.set(r.key, buf.toString("utf8"));
      }
    }
    return keys.map((k) => map.get(k) ?? null);
  }

  async set(
    key: string,
    value: string | number | Buffer,
    ...args: (string | number)[]
  ): Promise<string | null> {
    const now = nowSec();
    let expiresAt: number | null = null;
    let nx = false;
    for (let i = 0; i < args.length; i += 1) {
      const flag = String(args[i]).toUpperCase();
      if (flag === "EX" && i + 1 < args.length) {
        expiresAt = now + Number(args[i + 1]);
        i += 1;
      } else if (flag === "PX" && i + 1 < args.length) {
        expiresAt = now + Math.ceil(Number(args[i + 1]) / 1000);
        i += 1;
      } else if (flag === "NX") {
        nx = true;
      }
    }
    const buf = toBuffer(value);
    if (nx) {
      const { rows } = await db.query(
        `INSERT INTO kv_store (key, val, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE
           SET val = EXCLUDED.val, expires_at = EXCLUDED.expires_at
           WHERE kv_store.expires_at IS NOT NULL AND kv_store.expires_at <= $4
         RETURNING key`,
        [key, buf, expiresAt, now],
      );
      return rows.length ? "OK" : null;
    }
    await db.query(
      `INSERT INTO kv_store (key, val, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, expires_at = EXCLUDED.expires_at`,
      [key, buf, expiresAt],
    );
    return "OK";
  }

  async setex(
    key: string,
    seconds: string | number,
    value: string | number | Buffer,
  ): Promise<string> {
    const expiresAt = nowSec() + Number(seconds);
    await db.query(
      `INSERT INTO kv_store (key, val, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, expires_at = EXCLUDED.expires_at`,
      [key, toBuffer(value), expiresAt],
    );
    return "OK";
  }

  async incr(key: string): Promise<number> {
    return this.incrby(key, 1);
  }

  async incrby(
    key: string,
    increment: number,
    expiresAt?: number | string,
  ): Promise<number> {
    const exp = expiresAt !== undefined ? Math.floor(Number(expiresAt)) : null;
    const { rows } = await db.query(
      `INSERT INTO kv_store (key, val, expires_at)
       VALUES ($1, convert_to($2::text, 'UTF8'), $4)
       ON CONFLICT (key) DO UPDATE SET
         val = convert_to(
           (CASE
             WHEN kv_store.expires_at IS NOT NULL AND kv_store.expires_at <= $3 THEN 0
             ELSE COALESCE(NULLIF(convert_from(kv_store.val, 'UTF8'), ''), '0')::bigint
           END + $2::bigint)::text,
           'UTF8'
         ),
         expires_at = CASE
           WHEN $4::bigint IS NOT NULL THEN $4::bigint
           WHEN kv_store.expires_at IS NOT NULL AND kv_store.expires_at <= $3 THEN NULL
           ELSE kv_store.expires_at
         END
       RETURNING convert_from(val, 'UTF8')::bigint AS val`,
      [key, Math.trunc(increment), nowSec(), exp],
    );
    return Number(rows[0].val);
  }

  async del(...keys: string[]): Promise<number> {
    if (!keys.length) {
      return 0;
    }
    const results = await Promise.all([
      db.query("DELETE FROM kv_store WHERE key = ANY($1)", [keys]),
      db.query("DELETE FROM kv_hash WHERE key = ANY($1)", [keys]),
      db.query("DELETE FROM kv_zset WHERE key = ANY($1)", [keys]),
      db.query("DELETE FROM kv_set WHERE key = ANY($1)", [keys]),
      db.query("DELETE FROM kv_list WHERE key = ANY($1)", [keys]),
    ]);
    return results.reduce((acc, r) => acc + (r.rowCount ?? 0), 0);
  }

  async exists(key: string): Promise<number> {
    const now = nowSec();
    const { rows } = await db.query(
      `SELECT 1 FROM (
         SELECT 1 FROM kv_store WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)
         UNION ALL
         SELECT 1 FROM kv_zset WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)
         UNION ALL
         SELECT 1 FROM kv_hash WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)
         UNION ALL
         SELECT 1 FROM kv_set WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)
         UNION ALL
         SELECT 1 FROM kv_list WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)
       ) t LIMIT 1`,
      [key, now],
    );
    return rows.length ? 1 : 0;
  }

  async expire(key: string, seconds: number | string): Promise<number> {
    return this.expireat(key, nowSec() + Number(seconds));
  }

  async expireat(key: string, timestamp: number | string): Promise<number> {
    const ts = Math.floor(Number(timestamp));
    const results = await Promise.all([
      db.query("UPDATE kv_store SET expires_at = $2 WHERE key = $1", [key, ts]),
      db.query("UPDATE kv_hash SET expires_at = $2 WHERE key = $1", [key, ts]),
      db.query("UPDATE kv_zset SET expires_at = $2 WHERE key = $1", [key, ts]),
      db.query("UPDATE kv_set SET expires_at = $2 WHERE key = $1", [key, ts]),
      db.query("UPDATE kv_list SET expires_at = $2 WHERE key = $1", [key, ts]),
    ]);
    return results.some((r) => (r.rowCount ?? 0) > 0) ? 1 : 0;
  }

  async hget(key: string, field: string): Promise<string | null> {
    const { rows } = await db.query(
      "SELECT val FROM kv_hash WHERE key = $1 AND field = $2 AND (expires_at IS NULL OR expires_at > $3)",
      [key, field, nowSec()],
    );
    return rows.length ? rows[0].val : null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const { rows } = await db.query(
      "SELECT field, val FROM kv_hash WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)",
      [key, nowSec()],
    );
    const out: Record<string, string> = {};
    for (const r of rows) {
      out[r.field] = r.val;
    }
    return out;
  }

  async hincrby(
    key: string,
    field: string,
    increment: number,
    expiresAt?: number | string,
  ): Promise<number> {
    const exp = expiresAt !== undefined ? Math.floor(Number(expiresAt)) : null;
    const { rows } = await db.query(
      `INSERT INTO kv_hash (key, field, val, expires_at)
       VALUES ($1, $2, $3::text, $5)
       ON CONFLICT (key, field) DO UPDATE SET
         val = (CASE
           WHEN kv_hash.expires_at IS NOT NULL AND kv_hash.expires_at <= $4 THEN 0
           ELSE COALESCE(NULLIF(kv_hash.val, ''), '0')::bigint
         END + $3::bigint)::text,
         expires_at = CASE
           WHEN $5::bigint IS NOT NULL THEN $5::bigint
           WHEN kv_hash.expires_at IS NOT NULL AND kv_hash.expires_at <= $4 THEN NULL
           ELSE kv_hash.expires_at
         END
       RETURNING val::bigint AS val`,
      [key, field, Math.trunc(increment), nowSec(), exp],
    );
    return Number(rows[0].val);
  }

  async zadd(key: string, ...args: (string | number)[]): Promise<number> {
    const pairs: [number, string][] = [];
    for (let i = 0; i + 1 < args.length; i += 2) {
      pairs.push([Number(args[i]), String(args[i + 1])]);
    }
    if (!pairs.length) {
      return 0;
    }
    const members: string[] = [];
    const scores: number[] = [];
    // Deduplicate members within the same zadd call (last score wins)
    const dedup = new Map<string, number>();
    for (const [score, member] of pairs) {
      dedup.set(member, score);
    }
    for (const [member, score] of dedup) {
      members.push(member);
      scores.push(score);
    }
    const now = nowSec();
    const { rowCount } = await db.query(
      `INSERT INTO kv_zset (key, member, score, expires_at)
       SELECT $1, m, s, NULL
       FROM unnest($2::text[], $3::double precision[]) AS t(m, s)
       ON CONFLICT (key, member) DO UPDATE SET
         score = EXCLUDED.score,
         expires_at = CASE
           WHEN kv_zset.expires_at IS NOT NULL AND kv_zset.expires_at <= $4 THEN NULL
           ELSE kv_zset.expires_at
         END`,
      [key, members, scores, now],
    );
    return rowCount ?? 0;
  }

  async zscore(key: string, member: string | number): Promise<string | null> {
    const { rows } = await db.query(
      "SELECT score FROM kv_zset WHERE key = $1 AND member = $2 AND (expires_at IS NULL OR expires_at > $3)",
      [key, String(member), nowSec()],
    );
    return rows.length ? String(rows[0].score) : null;
  }

  async zcard(key: string): Promise<number> {
    const { rows } = await db.query(
      "SELECT count(*)::int AS cnt FROM kv_zset WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)",
      [key, nowSec()],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async zcount(
    key: string,
    min: string | number,
    max: string | number,
  ): Promise<number> {
    const params: any[] = [key, nowSec()];
    const cond = buildScoreCondition(min, max, params);
    const { rows } = await db.query(
      `SELECT count(*)::int AS cnt FROM kv_zset WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)${cond}`,
      params,
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async zrange(
    key: string,
    start: number | string,
    stop: number | string,
    withScores?: "WITHSCORES",
  ): Promise<string[]> {
    return this.zrangeInternal(key, Number(start), Number(stop), false, Boolean(withScores));
  }

  async zrevrange(
    key: string,
    start: number | string,
    stop: number | string,
    withScores?: "WITHSCORES",
  ): Promise<string[]> {
    return this.zrangeInternal(key, Number(start), Number(stop), true, Boolean(withScores));
  }

  private async zrangeInternal(
    key: string,
    start: number,
    stop: number,
    rev: boolean,
    withScores: boolean,
  ): Promise<string[]> {
    const order = rev ? "score DESC, member DESC" : "score ASC, member ASC";
    if (start >= 0 && stop >= 0) {
      if (start > stop) {
        return [];
      }
      const limit = stop - start + 1;
      const { rows } = await db.query(
        `SELECT member, score FROM kv_zset
         WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)
         ORDER BY ${order}
         LIMIT $3 OFFSET $4`,
        [key, nowSec(), limit, start],
      );
      if (!withScores) {
        return rows.map((r) => r.member);
      }
      const out: string[] = [];
      for (const r of rows) {
        out.push(r.member, String(r.score));
      }
      return out;
    }
    const { rows } = await db.query(
      `SELECT member, score FROM kv_zset WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2) ORDER BY ${order}`,
      [key, nowSec()],
    );
    const len = rows.length;
    if (!len) {
      return [];
    }
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : Math.min(len - 1, stop);
    if (s > e || s >= len || e < 0) {
      return [];
    }
    const sliced = rows.slice(s, e + 1);
    if (!withScores) {
      return sliced.map((r) => r.member);
    }
    const out: string[] = [];
    for (const r of sliced) {
      out.push(r.member, String(r.score));
    }
    return out;
  }

  async zrangebyscore(
    key: string,
    min: string | number,
    max: string | number,
  ): Promise<string[]> {
    const params: any[] = [key, nowSec()];
    const cond = buildScoreCondition(min, max, params);
    const { rows } = await db.query(
      `SELECT member FROM kv_zset WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)${cond} ORDER BY score ASC, member ASC`,
      params,
    );
    return rows.map((r) => r.member);
  }

  async zremrangebyscore(
    key: string,
    min: string | number,
    max: string | number,
  ): Promise<number> {
    const params: any[] = [key];
    const cond = buildScoreCondition(min, max, params);
    const { rowCount } = await db.query(
      `DELETE FROM kv_zset WHERE key = $1${cond}`,
      params,
    );
    return rowCount ?? 0;
  }

  async zremrangebyrank(
    key: string,
    start: number | string,
    stop: number | string,
  ): Promise<number> {
    const { rowCount } = await db.query(
      `WITH ranked AS (
         SELECT ctid,
                row_number() OVER (ORDER BY score ASC, member ASC) - 1 AS rn,
                count(*) OVER () AS cnt
         FROM kv_zset
         WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)
       ),
       bounds AS (
         SELECT ctid, rn,
                CASE WHEN $3 < 0 THEN GREATEST(0, cnt + $3) ELSE $3 END AS s,
                CASE WHEN $4 < 0 THEN cnt + $4 ELSE $4 END AS e
         FROM ranked
       )
       DELETE FROM kv_zset
       WHERE ctid IN (SELECT ctid FROM bounds WHERE rn >= s AND rn <= e)`,
      [key, nowSec(), Number(start), Number(stop)],
    );
    return rowCount ?? 0;
  }

  async zrandmember(key: string): Promise<string | null> {
    const { rows } = await db.query(
      "SELECT member FROM kv_zset WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2) ORDER BY random() LIMIT 1",
      [key, nowSec()],
    );
    return rows.length ? rows[0].member : null;
  }

  async saddWithExpiry(
    key: string,
    members: (string | number)[],
    expiresAt: number | string,
  ): Promise<number> {
    if (!members.length) {
      return 0;
    }
    const vals = members.map((m) => String(m));
    const { rowCount } = await db.query(
      `INSERT INTO kv_set (key, member, expires_at)
       SELECT $1, m, $3 FROM unnest($2::text[]) AS m
       ON CONFLICT (key, member) DO UPDATE SET
         expires_at = $3`,
      [key, vals, Math.floor(Number(expiresAt))],
    );
    return rowCount ?? 0;
  }

  async sadd(key: string, ...members: (string | number)[]): Promise<number> {
    if (!members.length) {
      return 0;
    }
    const vals = members.map((m) => String(m));
    const now = nowSec();
    const { rowCount } = await db.query(
      `INSERT INTO kv_set (key, member, expires_at)
       SELECT $1, m, NULL FROM unnest($2::text[]) AS m
       ON CONFLICT (key, member) DO UPDATE SET
         expires_at = CASE
           WHEN kv_set.expires_at IS NOT NULL AND kv_set.expires_at <= $3 THEN NULL
           ELSE kv_set.expires_at
         END`,
      [key, vals, now],
    );
    return rowCount ?? 0;
  }

  async spop(key: string, count: number): Promise<string[]>;
  async spop(key: string): Promise<string | null>;
  async spop(key: string, count?: number): Promise<string[] | string | null> {
    const limit = count ?? 1;
    const { rows } = await db.query(
      `DELETE FROM kv_set
       WHERE ctid IN (
         SELECT ctid FROM kv_set
         WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       RETURNING member`,
      [key, nowSec(), limit],
    );
    const members = rows.map((r) => r.member);
    if (count === undefined) {
      return members[0] ?? null;
    }
    return members;
  }

  async scard(key: string): Promise<number> {
    const { rows } = await db.query(
      "SELECT count(*)::int AS cnt FROM kv_set WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)",
      [key, nowSec()],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async lpush(key: string, ...values: (string | number)[]): Promise<number> {
    for (const v of values) {
      await db.query(
        "INSERT INTO kv_list (key, val, expires_at) VALUES ($1, $2, NULL)",
        [key, String(v)],
      );
    }
    const { rows } = await db.query(
      "SELECT count(*)::int AS cnt FROM kv_list WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)",
      [key, nowSec()],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const { rows } = await db.query(
      "SELECT val FROM kv_list WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2) ORDER BY id DESC",
      [key, nowSec()],
    );
    const len = rows.length;
    if (!len) {
      return [];
    }
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : Math.min(len - 1, stop);
    if (s > e || s >= len || e < 0) {
      return [];
    }
    return rows.slice(s, e + 1).map((r) => r.val);
  }

  async ltrim(key: string, start: number, stop: number): Promise<string> {
    await db.query(
      `WITH ranked AS (
         SELECT id,
                row_number() OVER (ORDER BY id DESC) - 1 AS rn,
                count(*) OVER () AS cnt
         FROM kv_list
         WHERE key = $1 AND (expires_at IS NULL OR expires_at > $2)
       ),
       bounds AS (
         SELECT id, rn,
                CASE WHEN $3 < 0 THEN GREATEST(0, cnt + $3) ELSE $3 END AS s,
                CASE WHEN $4 < 0 THEN cnt + $4 ELSE $4 END AS e
         FROM ranked
       )
       DELETE FROM kv_list
       WHERE key = $1 AND id IN (SELECT id FROM bounds WHERE rn < s OR rn > e)`,
      [key, nowSec(), start, stop],
    );
    return "OK";
  }

  async pfadd(key: string, ...values: string[]): Promise<number> {
    return this.sadd(key, ...values);
  }

  async pfcount(...keys: string[]): Promise<number> {
    if (!keys.length) {
      return 0;
    }
    const { rows } = await db.query(
      "SELECT count(DISTINCT member)::int AS cnt FROM kv_set WHERE key = ANY($1) AND (expires_at IS NULL OR expires_at > $2)",
      [keys, nowSec()],
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async publish(channel: string, message: string): Promise<number> {
    await db.query("SELECT pg_notify($1, $2)", [channel, message]);
    return 1;
  }

  async flushdb(): Promise<string> {
    await db.query(
      "TRUNCATE TABLE kv_store, kv_hash, kv_zset, kv_set, kv_list",
    );
    return "OK";
  }
}

const redis = new PgKvClient();

export async function cleanupExpiredKv() {
  const now = nowSec();
  await Promise.all([
    db.query("DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= $1", [now]),
    db.query("DELETE FROM kv_hash WHERE expires_at IS NOT NULL AND expires_at <= $1", [now]),
    db.query("DELETE FROM kv_zset WHERE expires_at IS NOT NULL AND expires_at <= $1", [now]),
    db.query("DELETE FROM kv_set WHERE expires_at IS NOT NULL AND expires_at <= $1", [now]),
    db.query("DELETE FROM kv_list WHERE expires_at IS NOT NULL AND expires_at <= $1", [now]),
  ]);
}

export async function getRedisCountDay(prefix: MetricName) {
  // Get counts for last 24 hour keys (including current partial hour)
  const keyArr = [];
  for (let i = 0; i < 24; i += 1) {
    keyArr.push(`${prefix}:v2:${getStartOfBlockMinutes(60, -i)}`);
  }
  const counts = await redis.mget(...keyArr);
  return counts.reduce((a, b) => Number(a) + Number(b), 0);
}

export async function getRedisCountHour(prefix: MetricName) {
  const result = await redis.get(`${prefix}:v2:${getStartOfBlockMinutes(60)}`);
  return Number(result);
}

export async function getRedisCountLastHour(prefix: MetricName) {
  // Get counts for previous full hour (not current)
  const result = await redis.get(
    `${prefix}:v2:${getStartOfBlockMinutes(60, -1)}`,
  );
  return Number(result);
}

export async function getRedisCountDayDistinct(prefix: MetricName) {
  // Get counts for last 24 hour keys (including current partial hour)
  const keyArr = [];
  for (let i = 0; i < 24; i += 1) {
    keyArr.push(`${prefix}:v2:${getStartOfBlockMinutes(60, -i)}`);
  }
  return redis.pfcount(...keyArr);
}

export async function getRedisCountDayHash(
  prefix: string,
): Promise<Record<string, number>> {
  const result = new Map<string, number>();
  for (let i = 0; i < 24; i += 1) {
    const key = `${prefix}:${getStartOfBlockMinutes(60, -i)}`;
    const hash = await redis.hgetall(key);
    for (let field in hash) {
      result.set(field, (result.get(field) ?? 0) + Number(hash[field]));
    }
  }
  return Object.fromEntries(result);
}

/**
 * Increments an hourly counter for the metric
 * @param prefix The counter name
 */
export async function redisCount(prefix: MetricName, incrBy = 1) {
  try {
    const key = `${prefix}:v2:${getStartOfBlockMinutes(60)}`;
    await redis.incrby(key, incrBy, getStartOfBlockMinutes(60, 24));
  } catch (e) {
    console.log(e);
  }
}

export async function redisCountDistinct(prefix: MetricName, value: string) {
  try {
    const key = `${prefix}:v2:${getStartOfBlockMinutes(60)}`;
    await redis.saddWithExpiry(key, [value], getStartOfBlockMinutes(60, 24));
  } catch (e) {
    console.log(e);
  }
}

export async function redisCountHash(
  prefix: string,
  field: string,
  incrBy = 1,
) {
  try {
    const key = `${prefix}:${getStartOfBlockMinutes(60)}`;
    await redis.hincrby(key, field, incrBy, getStartOfBlockMinutes(60, 24));
  } catch (e) {
    console.log(e);
  }
}

export default redis;
