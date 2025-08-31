import axios from 'axios';
const { config } = await import('../config.ts');

const output: string[] = [];

const arr = config.STEAM_API_KEY.split(',');
for (let i = 0; i < arr.length; i++) {
  const key = arr[i];
  try {
    const resp = await axios.get(
      `http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key=${key}`,
    );
    console.log(key, resp.status);
    if (resp.status !== 200) {
      console.log(resp.data);
    } else {
      output.push(key);
    }
  } catch (e: any) {}
}
console.log(output.join(','));
