const fs = require("fs");
const path = require("path");

// Function to import all files in a directory
function importDirectory(directory) {
  const files = {};

  // Read all files in the directory
  fs.readdirSync(directory).forEach((file) => {
    // Ignore non-JS files
    if (path.extname(file) !== ".js") return;

    // Import the file and add it to the files object
    const filePath = path.join(directory, file);
    const fileName = path.basename(file, ".js");
    files[fileName] = require(`./${filePath}`);
  });

  return files;
}

// Import all directories in the responses directory
const responses = {};
fs.readdirSync(".").forEach((dir) => {
  // Ignore the current file
  if (dir === "importResponses.js") return;

  // Only process directories
  if (fs.lstatSync(dir).isDirectory()) {
    responses[dir] = importDirectory(dir);
  }
});

module.exports = responses;
