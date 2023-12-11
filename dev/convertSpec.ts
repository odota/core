import fs from 'fs';
import spec from '../routes/spec.js';

fs.writeFileSync('./spec.json', JSON.stringify(spec, null, 2), 'utf-8');
