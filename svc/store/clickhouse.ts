import config from "../../config.ts";

console.log("[CLICKHOUSE] connecting %s", config.CLICKHOUSE_URL);

const parsedUrl = new URL(config.CLICKHOUSE_URL);
const defaultDb = parsedUrl.pathname.substring(1) || "yasp";
parsedUrl.pathname = "/";
const baseUrl = parsedUrl.toString();

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
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(`param_${k}`, String(v));
      }
    }
    const res = await fetch(url, {
      method: "POST",
      body: sql,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`[CLICKHOUSE] query error (${res.status}): ${text}`);
    }
    const trimmed = text.trim();
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
    const res = await fetch(url, {
      method: "POST",
      body: sql,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[CLICKHOUSE] exec error (${res.status}): ${text}`);
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
    const res = await fetch(url, {
      method: "POST",
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[CLICKHOUSE] insert error (${res.status}): ${text}`);
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
    const res = await fetch(url, {
      method: "POST",
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `[CLICKHOUSE] insertCompact error (${res.status}): ${text}`,
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
