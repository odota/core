import 'dotenv/config';
import { execSync } from 'node:child_process';

const strFmt = (
  matchId: string,
) => `curl -X POST 'https://api.stratz.com/graphql' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer ${process.env.STRATZ_TOKEN}' \
  -H 'user-agent: STRATZ_API' \
  -H 'GraphQL-Require-Preflight: 1' \
  --data-raw '{"query":"query Test {\\n  match(id: ${matchId}) {\\n    id \\n    sequenceNum\\n  }}","operationName":"Test"}'
`;

console.log(execSync(strFmt(process.argv[2])));
