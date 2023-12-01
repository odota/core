const fs = require('fs');
const spec = require('../routes/spec.js');

fs.writeFileSync('../spec.json', JSON.stringify(spec, null, 2), 'utf-8');
