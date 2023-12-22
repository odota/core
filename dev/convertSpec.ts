import fs from 'fs';
import spec from '../routes/spec';

fs.writeFileSync('./spec.json', JSON.stringify(spec, null, 2), 'utf-8');
