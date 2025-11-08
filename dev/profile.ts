import db from '../svc/store/db.ts';
import { addJob } from '../svc/store/queue.ts';

// const { rows } = await db.raw('select account_id from players where personaname is null');
// for (let i = 0; i < rows.length; i++) {
// await addJob({
//     name: 'profileQueue',
//     data: {
//         account_id: rows[i].account_id,
//     },
// });
// }

const { rows: rows2 } = await db.raw('select account_id from players LEFT JOIN rank_tier using(account_id) where rating is null');
for (let i = 0; i < rows2.length; i++) {
await addJob({
    name: 'mmrQueue',
    data: {
        account_id: rows2[i].account_id,
    },
});
}