// Processes a queue of requests to update MMR/rank medal for players
import { runQueue } from './store/queue.ts';
import db from './store/db.ts';
import config from '../config.ts';
import axios from 'axios';
import { redisCount } from './store/redis.ts';
import { getRandomRetrieverUrl } from './util/registry.ts';

runQueue(
  'mmrQueue',
  Number(config.MMR_PARALLELISM) || 1,
  async (job: MmrJob, i: number) => {
    const accountId = job.account_id;
    const url = await getRandomRetrieverUrl(`/profile/${accountId}`);
    console.log(url);
    let data: RetrieverPlayer | undefined = undefined;
    while (!data) {
      try {
        const result = await axios.get<RetrieverPlayer>(url, {
          timeout: 2000,
        });
        data = result.data;
      } catch (e) {
        console.log('[MMR] Error fetching data for %s, retrying...', accountId);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    redisCount('retriever_player');

    // Update player's Dota Plus status if changed
    const plus = Boolean(data.is_plus_subscriber);
    await db.raw(
      'UPDATE players SET plus = ? WHERE account_id = ? AND (plus != ? OR plus IS NULL)',
      [plus, data.account_id, plus],
    );

    if (data.rank_tier) {
      // Insert into history if different from current value
      // NOTE: This is a read-then-insert and might insert twice if the same player is processed in parallel
      await db.raw(
        'INSERT INTO rank_tier_history(account_id, time, rank_tier) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM rank_tier WHERE account_id = ? AND rating = ?)',
        [
          data.account_id,
          new Date(),
          data.rank_tier,
          data.account_id,
          data.rank_tier,
        ],
      );
      await db.raw(
        'INSERT INTO rank_tier(account_id, rating) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET rating = EXCLUDED.rating',
        [data.account_id, data.rank_tier],
      );
    }
    if (data.leaderboard_rank) {
      await db.raw(
        'INSERT INTO leaderboard_rank(account_id, rating) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET rating = EXCLUDED.rating',
        [data.account_id, data.leaderboard_rank],
      );
    }

    await db.raw('UPDATE players SET rank_tier_time = ? WHERE account_id = ?', [
      new Date(),
      job.account_id,
    ]);
  },
);
