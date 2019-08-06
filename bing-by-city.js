const _ = require('lodash');
const fs = require('fs-promise');
const puppeteer = require('puppeteer');
const rp = require('request-promise');
const Entities = require('html-entities').XmlEntities;
const entities = new Entities();

const searchDomain = 'https://www.bing.com';
const searchPrefix = '+"TSHQ License Agreement" +email';
const urlPrefix = 'https://www.bing.com/search?qs=n&form=QBLH&sp=-1&pq=%22tshq+license+agreement%22+email&sc=1-30&sk=&cvid=D8E807C40FEE40DE9AC2ED8FF14804F7&q=';

const CITY_FILE = `${__dirname}/input/cities.csv`;
const OUT_FILE = process.argv[2];

if (!OUT_FILE) {
  console.log(`Usage: node index.js [outfile]\n  (i.e. node index.js ./test.csv)`);
  process.exit(1);
}


console.log('----------- begin ------------');

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
      const city = parseCity(fields[8]);
      const state = trim(fields[9]);
      const population = parseInt(trim(fields[10]));
      return {
        city,
        state,
        population,
      }
    }).filter(entry => entry.city !== entry.state && entry.population >= 10000 && entry.city && entry.state && !entry.city.toLowerCase().includes('balance of'));

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

  console.log(`city: '${record.city}'`);

  // If we've already done this city, skip it
  if (list.find(item => item.city === record.city && item.state === record.state)) {
    return iterateCities(list, iter);
  }

  const searchTerm = encodeURIComponent(`${searchPrefix} +"${record.city}" +${record.state}`);
  const crawlUrl = `${urlPrefix}+${searchTerm}`

  return crawl(crawlUrl)
  .then((results) => {
    const cityResult = Object.assign({}, record);
    cityResult.leagues = results;
    list.push(cityResult);
    // write to file whatever we have so far
    const data = JSON.stringify(list);
    return fs.writeFile(OUT_FILE, data);
  })
  .then(() => sleep(Math.random() * 6 + 6))
  .then(() => iterateCities(list, iter));
}







function crawl (crawlUrl, previousEmails = []) {

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
    return Promise.all(links.map(l => followLink(l)))
    .then((results) => {
      return results.reduce((final, row) => {
        if (_.isEmpty(row)) {
          return final;
        }
        return final.concat(row);
      }, []);
    })
    .then((emails) => {
      // scan through the results and make sure there's something new or don't go on to next page
      console.log(previousEmails, emails);
      const hasOriginal = emails.reduce((final, item) => {
        if (previousEmails.find(e => e.email === item.email)) {
          return false;
        }
        return final;
      }, true);

      if (!hasOriginal || _.isEmpty(emails)) {
        console.log('no original []');
        return Promise.resolve([]);
      }

      const nextUrl = matchNextPageLink(html);
      if (!nextUrl) {
        console.log('no next page', emails);
        return Promise.resolve(emails);
      }

      return sleep(Math.random() * 5 + 5)
      .then(() => crawl(`${searchDomain}${entities.decode(nextUrl)}`, emails))
      .then((next) => {
        if (next) {
          console.log('concatenate next', next);
          emails = emails.concat(next);
          console.log(emails);
        }
        return Promise.resolve(emails);
      });
    });
  });
}

function parseSearchResults (html) {
  const match_r = /<cite>([^<]+)<\/cite>/gmi;
  const matches = [];
  let m;
  while (m = match_r.exec(html)) {
    if (m && m.length > 1) {
      matches.push(decodeURIComponent(m[1]));
    }
  }
  const filtered = matches.filter(m => !m.includes('bing') && m[0] !== '/' && !m.includes('bluesombrero') && !m.includes('gc.com'));
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

function parseCity(str) {
  if (!str) {
    return null;
  }
  const r = / (city|town|township|borough|county)$/i;
  return trim(trim(str).replace(r, ''));
}

function matchNextPageLink(html) {
  const next_r = /<a[^>]+title="Next page" href="([^"]+)"/gmi;
  const firstMatch = html.match(next_r);
  if (firstMatch && firstMatch.length > 1) {
    return firstMatch[1];
  } else if (firstMatch && firstMatch.length === 1) {
    const stupid_r = /href="([^"]+)"/i;
    const match = firstMatch[0].match(stupid_r);
    if (match && match.length > 1) {
      return match[1];
    }
  }

  console.error("  end of pages");
  return null;
}
