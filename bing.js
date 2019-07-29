/*
 * Bing Cognitive search API key: b170023ecdff49f4a846402d727833ba
 */
const fetch = require('node-fetch');

const _ = require('lodash');
const fs = require('fs-promise');
const puppeteer = require('puppeteer');

const CognitiveServicesCredentials = require('ms-rest-azure').CognitiveServicesCredentials;
const WebSearchAPIClient = require('azure-cognitiveservices-websearch');

const credentials = new CognitiveServicesCredentials('b170023ecdff49f4a846402d727833ba');
const webSearchApiClient = new WebSearchAPIClient(credentials);
const SEARCH_QUERY = '"TSHQ License Agreement" Email';


const PER_PAGE = 20;
const PAGES = process.argv[2];
const START_PAGE = process.argv[3];
const OUT_FILE = process.argv[4];

if (!PAGES || !START_PAGE || !OUT_FILE) {
  console.log(`Usage: node index.js [pages] [startpage] [outfile]\n  (i.e. node index.js 10 0 ./test.csv)`);
  process.exit(1);
}

function crawl (pages, offset = 0, mailingList) {
  if (!pages) {
    return Promise.resolve();
  }

  console.log(`  pages left: ${pages}, offset: ${offset}`);

  // get a page of search results
  // return webSearchApiClient.web.search(SEARCH_QUERY, {
  //   offset: offset,
  // })
  // return webSearchApiClient.web.search(SEARCH_QUERY, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, PER_PAGE, undefined, undefined, offset)
  const options = {
    method: 'GET',
    headers: {
      'Ocp-Apim-Subscription-Key': 'b170023ecdff49f4a846402d727833ba',
      'Host': 'api.cognitive.microsoft.com',
    }
  };

  return fetch(`https://api.cognitive.microsoft.com/bing/v7.0/search?q=${SEARCH_QUERY}&count=${PER_PAGE}&offset=${offset}`, options)
  .then((res) => res.json())
  .then((result) => {
    if (!_.get(result, 'webPages.value.length')) {
      console.log('no more results');
      return Promise.resolve([]);
    }

    const links = result.webPages.value.filter(v => !v.url.includes('google') && !v.url.includes('bluesombrero'));

    return Promise.all(links.map(l => followLink(l.url)))
    .then((results) => {
      results.forEach((result) => {
        mailingList = mailingList.concat(result);
      });

      // write to file whatever we have so far
      const uniqueEmails = unique(mailingList);
      const data = JSON.stringify(uniqueEmails);
      return fs.writeFile(OUT_FILE, data)
    })
    .then(() => sleep(5))
    .then(() => crawl(pages - 1, offset + PER_PAGE, mailingList))
    .then((next) => {
      if (next) {
        mailingList = mailingList.concat(next);
      }
      const uniqueEmails = unique(mailingList);
      return Promise.resolve(uniqueEmails);
    });
  });
}

function followLink (url) {
  console.log(`${url}`);

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


return fs.readFile(OUT_FILE)
.then((data) => {
  const list = JSON.parse(data);
  return crawl(PAGES, START_PAGE * PER_PAGE, list);
})
.catch(() => crawl(PAGES, START_PAGE * PER_PAGE, []))
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
