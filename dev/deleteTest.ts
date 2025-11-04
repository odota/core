import fs from 'node:fs/promises';

async function start() {
  await fs.writeFile('./cache/test', 'asdf');
  // await fs.unlink('./cache/test');
}
start();
