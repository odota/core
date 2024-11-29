import db from '../store/db';

async function start(){
    const result = await db.raw('DELETE from player_temp WHERE 1 = 0');
    console.log(result);
}
start();