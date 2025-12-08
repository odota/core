import fs from 'node:fs';
import { loadEnvFile } from 'node:process';

loadEnvFile();

const matchIds: number[] = [];

let next = true;
let last;
const accountId = process.argv[2];
while (next) {
  const resp = await fetch('https://api.stratz.com/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'STRATZ_API',
      'graphql-require-preflight': '1',
      authorization: 'Bearer ' + process.env.STRATZ_TOKEN,
    },
    body: `{"query":"query Test {\\n player(steamAccountId: ${accountId}) {\\n matches(request: { take: 100, before: ${last ?? Number.MAX_SAFE_INTEGER} }) {\\n id\\n }}}","operationName":"Test"}`,
  });
  const result = await resp.json();
  result.data.player.matches.forEach((r: any) => {
    last = r.id;
    matchIds.push(r.id);
    console.log(r.id);
  });
  next = result.data.player.matches.length;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// Output results
fs.writeFileSync('./matchIds.txt', JSON.stringify(matchIds));
