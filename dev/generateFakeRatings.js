const db = require('../store/db');
const async = require('async');

function randByCentralLimitTheorem() {
  let v = 0;
  for (let i = 0; i < 12; i += 1) {
    v += Math.random();
  }
  return v - 6;
}

function gaussianRandom(mean, std) {
  if (mean === undefined || std === undefined) {
    throw new Error('Gaussian random needs 2 arguments (mean, standard deviation)');
  }
  return randByCentralLimitTheorem() * std + mean;
}

db.from('players').asCallback((err, players) => {
  async.each(players, (p, cb) => {
    const fake = {
      match_id: p.account_id,
      account_id: p.account_id,
      solo_competitive_rank: Math.floor(gaussianRandom(4000, 1000)),
      competitive_rank: p.account_id % 8000,
      time: new Date(),
    };
    console.log(fake.account_id, fake.solo_competitive_rank);
    db.insert(fake).into('player_ratings').asCallback(cb);
  }, (err) => {
    process.exit(Number(err));
  });
});
