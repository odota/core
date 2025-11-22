// Processes a queue of requests to update MMR/rank medal for players
import { runQueue } from './store/queue.ts';
import db, { insertPlayerRating } from './store/db.ts';
import config from '../config.ts';
import { getRandomRetrieverUrl } from './util/utility.ts';
import axios from 'axios';
import { redisCount } from './store/redis.ts';

runQueue(
  'mmrQueue',
  Number(config.MMR_PARALLELISM) || 1,
  async (job: MmrJob) => {
    const accountId = job.account_id;
    const url = await getRandomRetrieverUrl(`/profile/${accountId}`);
    console.log(url);
    let data;
    while (!data) {
      try {
        const result = await axios.get(url, {
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
    const player = {
      account_id: job.account_id,
      plus: Boolean(data.is_plus_subscriber),
    };
    await db.raw(
      'UPDATE players SET plus = ? WHERE account_id = ? AND (plus != ? OR plus IS NULL)',
      [player.plus, player.account_id, player.plus],
    );

    if (data.rank_tier || data.leaderboard_rank) {
      data.account_id = job.account_id ?? null;
      await insertPlayerRating(db, data);
    }
    await db.raw('UPDATE players SET rank_tier_time = ? WHERE account_id = ?', [new Date(), player.account_id]);
  },
);
