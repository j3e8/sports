const fs = require('fs-promise');

const FILE = process.argv[2];

fs.readFile(FILE)
  .then((data) => {
    const list = JSON.parse(data);
    const flattened = unique(list.reduce((all, city) => {
      return all.concat(city.leagues);
    }, []));
    console.log(` ${flattened.length} email addresses`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`There was a problem reading the file`, err);
    process.exit(1);
  });

function unique(list) {
  const uniqueList = [];

  list.forEach((item) => {
    if (!uniqueList.find(u => u.email === item.email)) {
      uniqueList.push(item);
    }
  });

  return uniqueList;
}
