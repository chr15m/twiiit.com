const express = require("express");
const morgan = require("morgan");
const rfs = require("rotating-file-stream");
const mkdirp = require("mkdirp");
const fetch = require("node-fetch");
const jsdom = require("jsdom");

const nitterlist_url = "https://github.com/zedeus/nitter/wiki/Instances";
const servers = {};

function serve() {
  const app = express();

  const port = process.env["PORT"] || 8000;

  const logs = __dirname + "/logs";
  mkdirp(logs);

  const accesslog = rfs.createStream("access.log", {"interval": "1d", "path": logs, "compress": "gzip"});

  app.use(morgan("combined", {"stream": accesslog}));

  app.get("/*", (req, res) => {
    // pick a random nitter instance and redirect
    res.redirect("https://nitter.net" + req.path);
  });

  app.listen(port, () => console.log("Twiiit app listening on port " + port + "."));
}

function fetch_server_list() {
  return new Promise(function(res, err) {
    // download the list of nitter instances
    fetch(nitterlist_url).then(r=>r.text()).then(function(page) {
      const dom = new jsdom.JSDOM(page);
      const tables = dom.window.document.querySelectorAll("a#user-content-list-of-public-nitter-instances,table");
      const urls = [];
      let found = false;
      let table = null;
      for (e=0; e<tables.length; e++) {
        const el = tables[e];
        if (found) {
          table = tables[e];
          break;
        }
        if (el.id == "user-content-list-of-public-nitter-instances") {
          found = true;
        }
      }
      if (table) {
        table.querySelectorAll("tr").forEach(function(row) {
          const fields = Array.from(row.querySelectorAll("td"));
          if (fields[0] && fields[1] && fields[0].innerHTML.indexOf("✅") != -1) {
            //console.log(fields[0].innerHTML, fields[1].innerHTML);
            const a = fields[1].querySelector("a");
            if (a) {
              const href = a.getAttribute("href")
              urls.push(href.replace(/\/+$/, "") + "/");
            }
          }
        });
      }
      urls.push("https://nitter.net/");
      res(urls);
    }).catch(err);
  });
}

function test_server_list(urls) {
  //console.log("here", urls);
  // test each one for overload
  return Promise.all(urls.map(function(url) {
    return new Promise(function(res, err) {
      fetch(url + "jack").then(r=>r.text()).then(function(page) {
        //console.log(url, page.indexOf("error-panel"));
        if (page.indexOf("error-panel") == -1 && page.indexOf("rate limited") == -1) {
          res(url);
        } else {
          res(null);
        }
      }).catch(console.error);
    });
  }));
}

function filter_failing_urls(urls) {
  return urls.filter(t=>t);
}

// serve();
fetch_server_list().then(test_server_list).then(filter_failing_urls).then(console.log);
