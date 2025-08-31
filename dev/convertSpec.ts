import fs from 'fs';
import spec from '../svc/api/spec.ts';

fs.writeFileSync('./spec.json', JSON.stringify(spec, null, 2), 'utf-8');
