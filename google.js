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
  const filtered = matches.filter(m => !m.includes('google') && m[0] !== '/' && !m.includes('bluesombrero'));
  return _.uniq(filtered);
}

function crawl (pages, crawlUrl, mailingList) {
  if (!pages) {
    return Promise.resolve([]);
  }

  console.log(`crawling ${crawlUrl} (pages left: ${pages})`);

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

      // write to file whatever we have so far
      const uniqueEmails = unique(mailingList);
      const data = JSON.stringify(uniqueEmails);
      return fs.writeFile(OUT_FILE, data)
    })
    .then(() => sleep(Math.random() * 20 + 10))
    .then(() => {
      const nextUrl = entities.decode(matchNextPageLink(html));

      return crawl(pages - 1, `${google}${nextUrl}`, mailingList)
      .then((next) => {
        if (next) {
          mailingList = mailingList.concat(next);
        }
        const uniqueEmails = unique(mailingList);
        return Promise.resolve(uniqueEmails);
      });
    });
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

function matchNextPageLink(html) {
  const next_r = /<a(?:[^>]+)href="([^"]+)"(?:[^>]+)aria-label="Next page">/gmi;
  const firstMatch = html.match(next_r);
  console.log('firstMatch', firstMatch);
  if (firstMatch && firstMatch.length > 1) {
    return firstMatch[1];
  } else if (firstMatch && firstMatch.length === 1) {
    const stupid_r = /href="([^"]+)"/i;
    const match = firstMatch[0].match(stupid_r);
    console.log('stupid match', match);
    if (match && match.length > 1) {
      return match[1];
    }
  }

  const next_r2 = /<a(?:[^>]+)href="([^"]+)"(?:[^>]+)id="pnnext"(?:[^>]+)>/gmi;
  const secondMatch = html.match(next_r2);
  console.log('secondMatch', secondMatch);
  if (secondMatch && secondMatch.length > 1) {
    return secondMatch[1];
  } else if (secondMatch && secondMatch.length === 1) {
    const stupid_r = /href="([^"]+)"/i;
    const match = secondMatch[0].match(stupid_r);
    console.log('stupid match', match);
    if (match && match.length > 1) {
      return match[1];
    }
  }

  console.error("Can't find next page link!");
  console.log('\n\n\n\n\n\n\n');
  console.log(html);
  console.log('\n\n\n\n\n\n\n');
  process.exit(1);
}

console.log('crawling...');


const initialUrl = `${url}&start=${START_PAGE * PER_PAGE}`;

return fs.readFile(OUT_FILE)
.then((data) => {
  const list = JSON.parse(data);
  return crawl(PAGES, initialUrl, list);
})
.catch(() => crawl(PAGES, initialUrl, []))
.then((results) => {
  // write final results
  const data = JSON.stringify(results);
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
