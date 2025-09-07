import fs from 'fs';

const lines: string[] = [];
fs.readdirSync('./svc').forEach((f) => {
  lines.push(`import './svc/${f.split('.')[0]}.ts';`);
});
fs.writeFileSync('./everything.ts', lines.join('\n'));
