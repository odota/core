const fs = require("fs");
const path = require("path");

// Recursive function to import all files in a directory and its subdirectories
function importAll(directory) {
  let files = {};

  // Read all files and subdirectories in the directory
  fs.readdirSync(directory).forEach((item) => {
    const itemPath = path.join(directory, item);

    if (fs.lstatSync(itemPath).isDirectory()) {
      // If the item is a subdirectory, call this function with the subdirectory as the new starting point
      files = { ...files, ...importAll(itemPath) };
    } else if (path.extname(item) === ".js" && itemPath !== __filename) {
      // If the item is a JS file and not the current file, import it
      const fileName = path.basename(item, ".js");
      // eslint-disable-next-line import/no-dynamic-require, global-require
      files[fileName] = require(itemPath);
    }
  });

  return files;
}

// Import all files in the responses directory and its subdirectories
const queryParams = importAll(__dirname);

module.exports = queryParams;
