import { loadEnvFile } from "node:process";
import { addReliableJob } from "../svc/store/queue.ts";

loadEnvFile();

let next = true;
let last;
const accountId = process.argv[2];
while (next) {
  const resp = await fetch("https://api.stratz.com/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "STRATZ_API",
      "graphql-require-preflight": "1",
      authorization: "Bearer " + process.env.STRATZ_TOKEN,
    },
    body: `{"query":"query Test {\\n player(steamAccountId: ${accountId}) {\\n matches(request: { take: 100, before: ${last ?? Number.MAX_SAFE_INTEGER} }) {\\n id\\n }}}","operationName":"Test"}`,
  });
  const result: any = await resp.json();
  for (let r of result.data.player.matches) {
    await addReliableJob(
      { name: "parse", data: { match_id: r.id } },
      { priority: 0 },
    );
    last = r.id;
    console.log(r.id);
  }
  next = result.data.player.matches.length;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}