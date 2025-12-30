// Computes rank/mmr distributions and stores in Redis
import fs from "node:fs";
import db from "./store/db.ts";
import redis from "./store/redis.ts";
import { runInLoop } from "./util/utility.ts";

await runInLoop(
  async function distributions() {
    const results = await db.raw(fs.readFileSync(`./sql/ranks.sql`, "utf8"));
    const ranks = mapMmr(results);
    await redis.set(`distribution:ranks`, JSON.stringify(ranks));
  },
  6 * 60 * 60 * 1000,
);

function mapMmr(results: { rows: any[]; sum?: number }) {
  const sum = results.rows.reduce(
    (prev: any, current: any) => ({
      count: prev.count + current.count,
    }),
    {
      count: 0,
    },
  );
  const rows = results.rows.map((r: any, i: number) => {
    r.cumulative_sum = results.rows.slice(0, i + 1).reduce(
      (prev: any, current: any) => ({
        count: prev.count + current.count,
      }),
      {
        count: 0,
      },
    ).count;
    return r;
  });
  return { rows, sum };
}
