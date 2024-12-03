import { promises as fs } from 'fs';

async function start() {
  await fs.writeFile('./cache/test', 'asdf');
  // await fs.unlink('./cache/test');
}
start();
