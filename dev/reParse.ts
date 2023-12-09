// Issues reparse requests for all matches in postgres that aren't parsed
import db from '../store/db';
import {insertMatchPromise} from '../store/queries';
import { getDataPromise, generateJob } from '../util/utility';

async function start() {
    const matches = await db.raw('select match_id from matches where version IS NULL');
    for (let i = 0; i < matches.length; i++) {
        const input = matches[i];
        // match id request, get data from API
        const body: any = await getDataPromise(
        generateJob('api_details', input).url
        );
        // match details response
        const match = body.result;
        const job = await insertMatchPromise(match, {
        type: 'api',
        attempts: 1,
        priority: 1,
        forceParse: true
        });
    }
}
start();