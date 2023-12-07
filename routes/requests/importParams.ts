import fs from 'fs';
import path from 'path';

// Recursive function to import all files in a directory and its subdirectories
function importAll(directory: string) {
  let files: AnyDict = {};

  // Read all files and subdirectories in the directory
  fs.readdirSync(directory).forEach((item) => {
    const itemPath = path.join(directory, item);

    if (fs.lstatSync(itemPath).isDirectory()) {
      // If the item is a subdirectory, call this function with the subdirectory as the new starting point
      files = { ...files, ...importAll(itemPath) };
    } else if (path.extname(item) === '.ts' && itemPath !== __filename) {
      // If the item is a JS file and not the current file, import it
      const fileName = path.basename(item, '.ts');
      files[fileName] = require(itemPath);
    }
  });

  return files;
}

// Import all files in the responses directory and its subdirectories
export default importAll(__dirname);

