import axios from 'axios';
import config from '../config.js';

const output = [];

const arr = config.STEAM_API_KEY.split(',');
for (let i = 0; i < arr; i++) {
  const key = arr[i];
  const resp = await axios.get(
    `http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key=${key}`
  );
  console.log(key, resp.statusCode);
  if (resp.statusCode !== 200) {
    console.log(body);
  } else {
    output.push(key);
  }
}
console.log(output.join(','));
