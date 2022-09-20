/**
 * Function to build/cache sets of players
 * */
const async = require("async");
const moment = require("moment");

module.exports = function buildSets(db, redis, cb) {
  console.log("rebuilding sets");
  async.parallel(
    {
      // users in this set are added to the trackedPlayers set
      subscribers(cb) {
        db.select(["account_id"])
          .from("subscriber")
          .where("status", "=", "active")
          .asCallback((err, docs) => {
            if (err) {
              return cb(err);
            }
            const command = redis.multi();
            command.del("tracked");
            docs.forEach((player) => {
              // Refresh donators with expire date in the future
              command.zadd(
                "tracked",
                moment().add(1, "day").format("X"),
                player.account_id
              );
            });
            command.exec();
            return cb(err);
          });
      },
    },
    (err) => {
      if (err) {
        console.log("error occurred during buildSets: %s", err);
        return cb(err);
      }
      return cb(err);
    }
  );
};
