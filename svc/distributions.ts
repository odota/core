// Computes rank/mmr distributions and stores in Redis
import fs from 'fs';
import db from '../store/db';
import redis from '../store/redis';
import { invokeIntervalAsync } from '../util/utility';

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

async function doDistributions() {
  const results = await db.raw(fs.readFileSync(`./sql/ranks.sql`, 'utf8'));
  const ranks = mapMmr(results);
  await redis.set(`distribution:ranks`, JSON.stringify(ranks));
}
invokeIntervalAsync(doDistributions, 6 * 60 * 60 * 1000);
