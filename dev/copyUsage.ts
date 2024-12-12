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
        MAX(usage_count) as usage
        FROM api_key_usage
        WHERE
        timestamp >= ?
        AND timestamp <= ?
        GROUP BY account_id, api_key, ip
    `,
        [startTime, endTime],
    );
    console.log(rows);
    // Check if the usage count went down, if so, add the max to the current usage
}
start();