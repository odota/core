import db from '../svc/store/db.ts';
import { addJob } from '../svc/store/queue.ts';

const { rows } = await db.raw('select account_id from players where personaname is null');
for (let i = 0; i < rows.length; i++) {
await addJob({
    name: 'profileQueue',
    data: {
        account_id: rows[i].account_id,
    },
});
}