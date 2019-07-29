/*
 * Google Custom Search API key: AIzaSyAsIsTmfo7TeJSZLCpL_Clh0-ssH9K1PrY
 */

const _ = require('lodash');
const fs = require('fs-promise');
const puppeteer = require('puppeteer');
const rp = require('request-promise');
const Entities = require('html-entities').XmlEntities;
const entities = new Entities();

const google = 'https://www.google.com';
const url = 'https://www.google.com/search?q="TSHQ+License+Agreement"+email&filter=0';
const PER_PAGE = 10;

const PAGES = process.argv[2];
const START_PAGE = process.argv[3];
const OUT_FILE = process.argv[4];

if (!PAGES || !START_PAGE || !OUT_FILE) {
  console.log(`Usage: node index.js [pages] [startpage] [outfile]\n  (i.e. node index.js 10 0 ./test.csv)`);
  process.exit(1);
}

function parseSearchResults (html) {
  const match_r = /<a href="\/url\?q=(.*?)"/gmi;
  const matches = [];
  let m;
  while (m = match_r.exec(html)) {
    if (m && m.length > 1) {
      matches.push(m[1]);
    }
  }
  return _.uniq(matches.filter(m => !m.includes('google') && m[0] !== '/'));
}

function crawl (pages, crawlUrl) {
  if (!pages) {
    return;
  }

  console.log(`  pages left: ${pages}`);

  let mailingList = [];

  // get a page of search results
  return rp(crawlUrl)
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
    return Promise.all(links.map(l => followLink(l)))
    .then((results) => {
      results.forEach((result) => {
        mailingList = mailingList.concat(result);
      });
    })
    .then(() => sleep(Math.random() * 60 + 60))
    .then(() => {
      const next_r = /<a\s+class\s*=\s*"pn"\s*href\s*=\s*"(.*?)">/gmi;
      const match = html.match(next_r);

      console.log('match', match);

      if (match && match.length > 1) {
        return crawl(pages - 1, `${google}${match[1]}`);
      }
    })
  })
  .then((next) => {
    if (next) {
      mailingList = mailingList.concat(next);
    }
    return Promise.resolve(unique(mailingList));
  });
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
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, Math.floor(seconds * 1000));
  });
}

console.log('crawling...');


const initialUrl = `${url}&start=${(START_PAGE || 0) * PER_PAGE}`;

return crawl(PAGES, initialUrl)
.then((results) => {
  console.log(results);
  console.log(`${results.length} results`);
  const data = results.map((r) => {
    return `${r.url},${r.email}`;
  }).join(`\n`);
  return fs.writeFile(OUT_FILE, data);
})
.then(() => {
  console.log('done');
  process.exit(0);
})
.catch((err) => {
  console.error(err);
  process.exit(1);
});
