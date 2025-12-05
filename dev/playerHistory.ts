import 'dotenv/config';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const matchIds: number[] = [];

const strFmt = (
  before?: number
) => `curl -X POST 'https://api.stratz.com/graphql' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer ${process.env.STRATZ_TOKEN}' \
  -H 'User-Agent: STRATZ_API' \
  -H 'GraphQL-Require-Preflight: 1' \
  --data-raw '{"query":"query Test {\\n player(steamAccountId: 348519627) {\\n matches(request: { take: 100, before: ${before ?? Number.MAX_SAFE_INTEGER} }) {\\n id\\n }}}","operationName":"Test"}'
`;

let next = true;
let last;
while (next) {
    const result = JSON.parse(execSync(strFmt(last)).toString());
    console.log(result);
    result.data.player.matches.forEach((r: any) => {
        last = r.id;
        matchIds.push(r.id);
        console.log(r.id);
    });
    next = result.data.player.matches.length;
    await new Promise(resolve => setTimeout(resolve, 1000));
}

// Output results
fs.writeFileSync('./matchIds.txt', JSON.stringify(matchIds));
