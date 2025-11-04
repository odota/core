// Processes a queue of requests to update MMR/rank medal for players
import { runQueue } from './store/queue.ts';
import db from './store/db.ts';
import { insertPlayerRating } from './util/insert.ts';
import config from '../config.ts';
import { redisCount, getRandomRetrieverUrl } from './util/utility.ts';
import axios from 'axios';

runQueue(
  'mmrQueue',
  Number(config.MMR_PARALLELISM) || 1,
  async (job: MmrJob) => {
    const accountId = job.account_id;
    const url = await getRandomRetrieverUrl(`/profile/${accountId}`);
    console.log(url);
    const { data } = await axios.get(url, {
      timeout: 5000,
    });
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
    await new Promise((resolve) => setTimeout(resolve, 1));
  },
);
