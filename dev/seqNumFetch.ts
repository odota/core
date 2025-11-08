const strFmt = (
  matchId: string,
) => `curl -X POST 'https://api.stratz.com/graphql' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer '${process.env.STRATZ_TOKEN}' \
  -H 'user-agent: STRATZ-API' \
  -H 'GraphQL-Require-Preflight: 1' \
  --data-raw '{"query":"query Test {\n  match(id: ${matchId}) {\n    id\n    sequenceNum\n  }\n}","operationName":"Test"}'
`;
