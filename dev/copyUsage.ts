import db from "../svc/store/db.ts";
import moment from "moment";

const startTime = moment.utc().startOf("month").format("YYYY-MM-DD");
const endTime = moment.utc().endOf("month").format("YYYY-MM-DD");
const { rows } = await db.query(
  `
        SELECT
        account_id,
        api_key,
        ip,
        MAX(usage_count) as max_usage
        FROM api_key_usage
        WHERE
        timestamp >= $1
        AND timestamp <= $2
        GROUP BY account_id, api_key, ip
        ORDER by max_usage
    `,
  [startTime, endTime],
);
// console.log(rows);
const apiTimestamp = moment.utc().startOf("month");
for (let row of rows) {
  const curr = await db.query(
    "select * from api_key_usage where api_key = $1 and timestamp = $2",
    [row.api_key, apiTimestamp],
  );
  console.log(row.max_usage, curr.rows[0]?.usage_count);
}
