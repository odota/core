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
    const apiTimestamp = moment().startOf('month');
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const curr = await db.raw('select * from api_key_usage where api_key = ? and timestamp = ?', [row.api_key, apiTimestamp]);
        console.log(row.max_usage, curr.rows[0]?.usage_count);
        // Copy the usage to the first day of the month
        // await db.raw(`
        // INSERT INTO api_key_usage
        // (account_id, api_key, customer_id, timestamp, ip, usage_count) VALUES
        // (?, ?, ?, ?, ?, ?)
        // ON CONFLICT ON CONSTRAINT api_key_usage_pkey DO UPDATE SET usage_count = ?
        // `, [row.account_id, row.api_key, row.customer_id, apiTimestamp, '', row.max_usage, row.max_usage]);
    }
}
start();