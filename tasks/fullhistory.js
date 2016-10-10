/**
 * Queue an account_id for fullhistory
 * node tasks/fullhistory :account_id
 **/
const queue = require('../store/queue');
const fhQueue = queue.getQueue('fullhistory');
const player = {
  account_id: Number(process.argv[2]),
};
queue.addToQueue(fhQueue, player,
  {
    attempts: 1,
  }, (err, job) => {
    if (err)
    {
      console.error(err);
    }
    process.exit(err ? 1 : 0);
  });
