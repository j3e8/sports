const _ = require('lodash');
const fs = require('fs-promise');
const puppeteer = require('puppeteer');
const rp = require('request-promise');
const Entities = require('html-entities').XmlEntities;
const entities = new Entities();

const searchDomain = 'https://www.metacrawler.com';
const url = 'http://www.metacrawler.com/serp?q=%22TSHQ+License+Agreement%22+email&sc=gnGE03WUetZ-lusCQZQE69vGxRVs4I31ZyPaRMLNpHiRwkTsqip1Z5DRV9IfLpfn9PEgl44pxJxR-vAc3f9iK7dTXUlpa8bwRC1RqQDMihAF_vAiASpS2f6qboP2EaYLgs-6kwLFVdWWwnn_b1qc3KDpO1gNbu-mvr8v8zIX2JKTkTmrFQUTtREjs7VK31-1zjwa9suA0oDqHMhxKFW51pNEp9iS4CPf0XJ1I4zRnReBxBtAH7l_60rRba8_30cMahHyK_s_4LCgy-tCGTRuKfkpkx1A3uUjZ-Shmz0DqyOBQ__LgXMdNo9gghkXoWruvJdsrQRHNMUmKG3eCrZqpYcO4ijt7W5x4aIr5zM_BcM4Y3UUpfOLAwVWEgmuaLNMrjUr2gkPuy_zvTrbW2AwiZQhuCumTP7lGBE-eARfKoWVOij8nj3O9zuGlgAAQ2WrQk0WmgtTrJf-DuFGVpsnFKBZVoLawu1YBDlGWcc_6aJ85hehBthV9SwIuu1VchkIG3yd4SF-ucuJUTgPyyr5va4oatL8q3ktHIf_sbSG9QP4A158yvoSTFMMZOufONlyLANGVEY-zKcpfrZ9mlyp1kfycD3s-5p7FaS8h2o1d6tV4ESEZDcA504tPsubw7bo_uxBl0EsF80WojCMcVv036vra86vyDNHrZHpoERU2yC1Im_M4oF_3qE5cDuxicvqN1nNUnbAPhuhgzDokEID8IU6f46UjmAkFUuqp-gSTsuQ3zNMeWvsAFZjv5KO-Y4gl7Gj4zg9ehNlguwLLWosEwc48CgxuWpfVOyNw9nmtmk27-3MtURIZ-rSHZ8rYYD5NxvfEXoWjCrU-lWd-d62i_myizgbT9Wg18LQoW3NEEzSjrOUJU772fHUoQ_tmKL7lPBZf8jZ6kFFy-ySQEqt7fUThXqkcL7Hiy-sQIt-Wq1UTznxVa2Yy9HLeMfCaGlbBs0cNXx8sLg7fQkbc2Ay_2G3l-75SW3JiB29L9RkrmUtWMcvL1NBifN0X10jxmiPWMP62oyv7oXVLz-K__nBlrnWSIvj1wyxHWiemu_Z0iR80kd293qGlwtI9t-1EFaMfwtfDfiPISxCz5p44eDx3Wm53Xt8wi08xC5qqYMguxXUcDYAQ3AzlaLWxGjFtiOUDRjf2ZSlV7YEv6YyCCTI0SVbmMZ3dThoB4hneHLoDI0qMN-w0btTLmrVHXg4v5m5DZbkBDOuN5hjctu_Pvi1t-phdVFWMbz5_92NVRxUVHxkvcwrJS3V7VpLWeUf3KLdD2C4YzdR2eNFPKdQooy4moASE6DEtn2JmsG85A0JwQqmvRLjW0PLwkTtkk-mPKoy5vPSOkN-pM7cbPMOLuFmQWVBYDKukIe_YXDEcavO7m2sTpNZGe4URxCRFLbJI4Z5ZDzPFQ7apfOcv9UJi6hv6dII6AqA_yt6z2rpkXSSYOv9lVyvLXyfZfJRUcjvIZDTRbtk8D38tgjHQ6LokRsAn8nkEyiuoBsG8eYEKiFtm8ZxnUiGGq8y5bR79yVacOJr7SCX3CCnPYpTiiN95nnya6Tgpw13sZRVHWDELp2eublh-mCE7Fa_SZSFbDvZ3eoq7maItBHtDyZK68xBZKcmdvwc_Bq5ofk7ydPhFSR3wQAlsSdxsi2A';

const PAGES = process.argv[2];
const START_PAGE = process.argv[3];
const OUT_FILE = process.argv[4];

if (!PAGES || !START_PAGE || !OUT_FILE) {
  console.log(`Usage: node index.js [pages] [startpage] [outfile]\n  (i.e. node index.js 10 0 ./test.csv)`);
  process.exit(1);
}

function parseSearchResults (html) {
  const match_r = /<a class="web-bing__title" href="(.*?)"/gmi;
  const matches = [];
  let m;
  while (m = match_r.exec(html)) {
    if (m && m.length > 1) {
      matches.push(m[1]);
    }
  }
  const filtered = matches.filter(m => !m.includes('metacrawler') && m[0] !== '/' && !m.includes('bluesombrero'));
  return _.uniq(filtered);
}

function crawl (pages, crawlUrl, mailingList) {
  if (!pages) {
    return Promise.resolve([]);
  }

  console.log(`crawling ${crawlUrl} (pages left: ${pages})`);

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
      results.forEach((result) => {
        mailingList = mailingList.concat(result);
      });

      // write to file whatever we have so far
      const uniqueEmails = unique(mailingList);
      const data = JSON.stringify(uniqueEmails);
      return fs.writeFile(OUT_FILE, data)
    })
    .then(() => sleep(Math.random() * 10 + 10))
    .then(() => {
      const nextUrl = entities.decode(matchNextPageLink(html));

      return crawl(pages - 1, `${searchDomain}${nextUrl}`, mailingList)
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
  const next_r = /<a(?:[^>]+)class="(?:[^"]+)pagination__num--next"(?:[^>]+)href="(.*?)"/gmi;
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

  console.error("Can't find next page link!");
  console.log('\n\n\n\n\n\n\n');
  console.log(html);
  console.log('\n\n\n\n\n\n\n');
  process.exit(1);
}

console.log('crawling...');


const initialUrl = `${url}&page=${START_PAGE}`;

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
  const resume = Number(START_PAGE) + Number(PAGES);
  console.log(`left off on page ${resume}`);
  console.log('done');
  process.exit(0);
})
.catch((err) => {
  console.error(err);
  process.exit(1);
});
