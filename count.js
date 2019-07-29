const fs = require('fs-promise');

const FILE = process.argv[2];

fs.readFile(FILE)
  .then((data) => {
    const list = JSON.parse(data);
    console.log(` ${list.length} email addresses`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`There was a problem reading the file`, err);
    process.exit(1);
  });
