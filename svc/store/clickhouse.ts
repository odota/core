import http from "node:http";
import https from "node:https";
import config from "../../config.ts";

console.log("[CLICKHOUSE] connecting %s", config.CLICKHOUSE_URL);

const parsedUrl = new URL(config.CLICKHOUSE_URL);
const defaultDb = parsedUrl.pathname.substring(1) || "yasp";
parsedUrl.pathname = "/";
const baseUrl = parsedUrl.toString();

const isHttps = parsedUrl.protocol === "https:";
const maxConnections = Number(config.CLICKHOUSE_MAX_CONNECTIONS) || 10;
const agent = isHttps
  ? new https.Agent({ keepAlive: true, maxSockets: maxConnections })
  : new http.Agent({ keepAlive: true, maxSockets: maxConnections });

function post(
  url: URL,
  body: string,
  timeoutMs = 30_000,
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const mod = isHttps ? https : http;
    const req = mod.request(
      url,
      {
        method: "POST",
        agent,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

export const clickhouse = {
  async query<T = AnyDict>(
    sql: string,
    params?: Record<string, string | number | boolean>,
    database = defaultDb,
  ): Promise<T[]> {
    const url = new URL(baseUrl);
    if (database) {
      url.searchParams.set("database", database);
    }
    url.searchParams.set("default_format", "JSONEachRow");
    url.searchParams.set("output_format_json_quote_64bit_integers", "0");
    url.searchParams.set("max_execution_time", "10");
    url.searchParams.set("cancel_http_readonly_queries_on_client_close", "1");
    url.searchParams.set("max_threads", "1");
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(`param_${k}`, String(v));
      }
    }
    const res = await post(url, sql, 10_000);
    if (!res.ok) {
      throw new Error(`[CLICKHOUSE] query error (${res.status}): ${res.text}`);
    }
    const trimmed = res.text.trim();
    if (!trimmed) {
      return [];
    }
    return trimmed.split("\n").map((line) => JSON.parse(line));
  },

  async exec(sql: string, database = defaultDb): Promise<void> {
    const url = new URL(baseUrl);
    if (database) {
      url.searchParams.set("database", database);
    }
    const res = await post(url, sql);
    if (!res.ok) {
      throw new Error(`[CLICKHOUSE] exec error (${res.status}): ${res.text}`);
    }
  },

  async insert(
    table: string,
    rows: AnyDict | AnyDict[],
    database = defaultDb,
  ): Promise<void> {
    const rowArr = Array.isArray(rows) ? rows : [rows];
    if (!rowArr.length) {
      return;
    }
    const url = new URL(baseUrl);
    if (database) {
      url.searchParams.set("database", database);
    }
    url.searchParams.set("query", `INSERT INTO ${table} FORMAT JSONEachRow`);
    const body = rowArr.map((r) => JSON.stringify(r)).join("\n");
    const res = await post(url, body);
    if (!res.ok) {
      throw new Error(`[CLICKHOUSE] insert error (${res.status}): ${res.text}`);
    }
  },

  async insertCompact(
    table: string,
    columns: string[],
    rows: any[][],
    database = defaultDb,
  ): Promise<void> {
    if (!rows.length) {
      return;
    }
    const url = new URL(baseUrl);
    if (database) {
      url.searchParams.set("database", database);
    }
    url.searchParams.set(
      "query",
      `INSERT INTO ${table} (${columns.join(",")}) FORMAT JSONCompactEachRow`,
    );
    const body = rows.map((r) => JSON.stringify(r)).join("\n");
    const res = await post(url, body);
    if (!res.ok) {
      throw new Error(
        `[CLICKHOUSE] insertCompact error (${res.status}): ${res.text}`,
      );
    }
  },
};

const clickhouseColumnInfo: Record<string, Record<string, string>> = {};
export async function getClickhouseColumns(table: string) {
  if (!clickhouseColumnInfo[table]) {
    const rows = await clickhouse.query<{ name: string; type: string }>(
      "SELECT name, type FROM system.columns WHERE database = {db:String} AND table = {table:String}",
      {
        db: config.NODE_ENV === "test" ? "yasp_test" : "yasp",
        table,
      },
    );
    clickhouseColumnInfo[table] = {};
    rows.forEach((r) => {
      clickhouseColumnInfo[table][r.name] = r.type;
    });
  }
  return clickhouseColumnInfo[table];
}

export default clickhouse;
