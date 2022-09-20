/**
 * Recalculate patch ID for matches in match table
 * */
const async = require("async");
const constants = require("dotaconstants");
const db = require("../store/db");
const queries = require("../store/queries");
const utility = require("../util/utility");

db.select(["match_id", "start_time"])
  .from("matches")
  .orderBy("match_id", "desc")
  .asCallback((err, matchIds) => {
    if (err) {
      throw err;
    }
    async.eachSeries(
      matchIds,
      (match, cb) => {
        const patch =
          constants.patch[utility.getPatchIndex(match.start_time)].name;
        console.log(match.match_id, patch);
        queries.upsert(
          db,
          "match_patch",
          {
            match_id: match.match_id,
            patch,
          },
          {
            match_id: match.match_id,
          },
          cb
        );
      },
      (err) => {
        process.exit(Number(err));
      }
    );
  });
