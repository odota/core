import config from '../config.ts';

const output: string[] = [];

const arr = config.STEAM_API_KEY.split(',');
for (let key of arr) {
  const resp = await fetch(
    `http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key=${key}`,
  );
  if (!resp.ok) {
    console.log(await resp.text());
  } else {
    output.push(key);
  }
  console.log(key, resp.status);
}
console.log(output.join(','));
