import { loadEnvFile } from 'node:process';

loadEnvFile();

const matchId = process.argv[2];
const resp = await fetch('https://api.stratz.com/graphql', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'user-agent': 'STRATZ_API',
    'graphql-require-preflight': '1',
    authorization: 'Bearer ' + process.env.STRATZ_TOKEN,
  },
  body: `{"query":"query Test {\\n  match(id: ${matchId}) {\\n    id \\n    sequenceNum\\n  }}","operationName":"Test"}`,
});
console.log(await resp.json());
