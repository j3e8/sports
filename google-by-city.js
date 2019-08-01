const _ = require('lodash');
const fs = require('fs-promise');
const puppeteer = require('puppeteer');
const rp = require('request-promise');
const Entities = require('html-entities').XmlEntities;
const entities = new Entities();

const urlPrefix = 'https://www.google.com/search?q="TSHQ+License+Agreement"+email';

const CITY_FILE = `${__dirname}/input/cities.csv`;
const OUT_FILE = process.argv[2];

if (!OUT_FILE) {
  console.log(`Usage: node index.js [outfile]\n  (i.e. node index.js ./test.csv)`);
  process.exit(1);
}


console.log('crawling...');

return fs.readFile(OUT_FILE, 'utf8')
.then((data) => {
  return JSON.parse(data);
})
.catch(() => [])
.then((list) => {
  return fs.readFile(CITY_FILE, 'utf8')
  .then((csv) => {
    const cities = csv.split('\n').slice(1).map((line) => {
      const fields = line.split(',');
      const city = trim(fields[8]);
      const state = trim(fields[9]);
      const population = parseInt(trim(fields[10]));
      return {
        city,
        state,
        population,
      }
    }).filter(entry => entry.city !== entry.state && entry.population >= 15000);

    const iter = cities.entries();
    return iterateCities(list, iter);
  });
})
.then(() => {
  console.log('done');
  process.exit(0);
})
.catch((err) => {
  console.error(err);
  process.exit(1);
});


function iterateCities(list, iter) {
  const iteration = iter.next();
  if (iteration.done) {
    return Promise.resolve();
  }

  const record = iteration.value[1];

  // If we've already done this city, skip it
  if (list.find(item => item.city === record.city && item.state === record.state)) {
    return iterateCities(list, iter);
  }

  return crawl(record)
  .then((results) => {
    const cityResult = Object.assign({}, record);
    cityResult.leagues = results;
    list.push(cityResult);
    // write to file whatever we have so far
    const data = JSON.stringify(list);
    return fs.writeFile(OUT_FILE, data);
  })
  .then(() => sleep(Math.random() * 10 + 10))
  .then(() => iterateCities(list, iter));
}






function crawl (record) {
  const searchTerm = encodeURIComponent(`${record.city}+${record.state}`);
  const crawlUrl = `${urlPrefix}+${searchTerm}`

  console.log(`crawling ${crawlUrl}`);

  // get a page of search results
  return rp(crawlUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537.36' } })
  .then((html) => {
    const links = _.uniq(
      parseSearchResults(html)
      .map((link) => {
        try {
          const decodedLink = entities.decode(link);
          const domain = new URL(decodedLink).origin;
          return domain;
        } catch (ex) {
          return null;
        }
      })
      .filter(l => l)
    );

    console.log(links.join('\n'));

    // follow each link to a sports site
    return Promise.all(links.map(l => followLink(l)));
  })
  .then((results) => {
    return results.reduce((final, row) => {
      if (_.isEmpty(row)) {
        return final;
      }
      return final.concat(row);
    }, []);
  });
}

function parseSearchResults (html) {
  const match_r = /<a href="(http[^"]+)"/gmi;
  const matches = [];
  let m;
  while (m = match_r.exec(html)) {
    if (m && m.length > 1) {
      matches.push(m[1]);
    }
  }
  const filtered = matches.filter(m => !m.includes('google') && m[0] !== '/' && !m.includes('bluesombrero') && !m.includes('gc.com'));
  return _.uniq(filtered);
}

function followLink (url) {
  return puppeteer.launch()
  .then((browser) => {
    return browser.newPage()
    .then((page) => {
      return page.goto(url, { waitUntil: 'networkidle0' })
      .then(() => page.content())
    })
    .then((html) => {
      browser.close();

      const emails = findEmails(html);
      if (!emails || !emails.length) {
        console.warn(`  No emails found`, url);
      }
      return emails.map((email) => {
        return {
          url,
          email,
        }
      });
    });
  })
  .catch(() => []);
}

function findEmails (html) {
  const match_r = /[a-z0-9_\-\.]+@[a-z0-9_\-\.]+\.[a-z]+/gmi;
  const matches = [];
  let m;
  while (m = match_r.exec(html)) {
    if (m && m.length) {
      matches.push(m[0]);
    }
  }
  return _.uniq(matches);
}

function unique(list) {
  const uniqueList = [];

  list.forEach((item) => {
    if (!uniqueList.find(u => u.email === item.email)) {
      uniqueList.push(item);
    }
  });

  return uniqueList;
}

function sleep(seconds) {
  const sec = Math.floor(seconds);
  console.log(`sleeping for ${sec}s...`);
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, sec * 1000);
  });
}

function trim(str) {
  if (!str) {
    return '';
  }
  return str.replace(/^\s+/, '').replace(/\s+$/, '');
}
