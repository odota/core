const populate = require('./populate');

function processParsedData(entries, container) {
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    populate(e, container);
  }
  return container;
}

module.exports = processParsedData;
