import db from '../store/db';
import moment from 'moment';

async function start() {
    const startTime = moment().startOf('month').format('YYYY-MM-DD');
    const endTime = moment().endOf('month').format('YYYY-MM-DD');
    const { rows } = await db.raw(
        `
        SELECT
        account_id,
        api_key,
        ip,
        MAX(usage_count) as max_usage
        FROM api_key_usage
        WHERE
        timestamp >= ?
        AND timestamp <= ?
        GROUP BY account_id, api_key, ip
        ORDER by max_usage
    `,
        [startTime, endTime],
    );
    // console.log(rows);
    const apiTimestamp = moment().startOf('day');
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const curr = await db.raw('select * from api_key_usage where api_key = ? and timestamp = ?', [row.api_key, apiTimestamp]);
        console.log(row.max_usage, curr.rows[0].usage_count);
        // Check if the usage count went down, if so, add the max to the current usage
        // await db.raw('update api_key_usage set usage_count = ? where api_key = ? and timestamp = ?', [Number(row.max_usage) + Number(curr.rows[0].usage_count), row.api_key, apiTimestamp]);
    }
}
start();