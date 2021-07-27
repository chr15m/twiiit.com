const util = require("util");
const express = require("express");
const morgan = require("morgan");
const rfs = require("rotating-file-stream");
const mkdirp = require("mkdirp");
const fetch = require("node-fetch");
const jsdom = require("jsdom");
const m = require("motionless");

const nitterlist_url = "https://github.com/zedeus/nitter/wiki/Instances";
const instances = [];
const check_interval = 1000 * 60 * 5;

function index() {
  const template = m.dom(m.load("index.html"));
  const content = m.md(m.load("README.md"));
  template.$("main").innerHTML = content;
  return template.render();
}

function serve() {
  const app = express();

  const port = process.env["PORT"] || 8000;

  const logs = __dirname + "/logs";
  mkdirp(logs);

  const accesslog = rfs.createStream("access.log", {"interval": "1d", "path": logs, "compress": "gzip"});

  // set up error logging
  const errorlog = rfs.createStream("error.log", {"interval": "7d", "path": logs, "compress": "gzip"});
  const stdout = process.stdout;
  function logfn(...args) {
    const date = (new Date()).toISOString().replace(/\..*/, "").split("T");
    const out = date.join(" ") + " " + util.format.apply(null, args) + "\n";
    stdout.write(out);
    errorlog.write(out);
  }
  console.log = logfn;
  console.error = logfn;

  const staticsite = index();

  app.use(morgan("combined", {"stream": accesslog}));

  app.get("/", (req, res) => {
    res.send(staticsite);
  });

  app.get("/*", (req, res) => {
    // pick a random nitter instance and redirect
    const instance = instances[Math.floor(Math.random() * instances.length)];
    if (instance) {
      res.redirect(instance + req.path);
    } else {
      res.status(421).header("Content-type", "text/plain").send("Sorry, couldn't find a Nitter instance.");
    }
  });

  app.listen(port, () => console.log("Twiiit app listening on port " + port + "."));
}

function fetch_server_list() {
  return new Promise(function(res, err) {
    // download the list of nitter instances
    fetch(nitterlist_url)
      .then(function(response) {
        if (response.ok) {
          return response.text();
        } else {
          res([]);
        }
      }).then(function(page) {
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
              urls.push(href.replace(/\/+$/, ""));
            }
          }
        });
      }
      urls.push("https://nitter.net");
      res(urls);
    })
    .catch(function(error) {
      console.error(error);
      res([]);
    });
  });
}

function test_server_list(urls) {
  //console.log("here", urls);
  // test each one for overload
  return Promise.all(urls.map(function(url) {
    return new Promise(function(res, err) {
      fetch(url + "/jack").then(function(response) {
        if (response.ok) {
          return response.text();
        } else {
          res(null);
        }
      }).then(function(page) {
        //console.log(url, page.indexOf("error-panel"));
        if (page) {
          res(url);
        } else {
          res(null);
        }
      }).catch(function(error) {
        console.error(error);
        res(null);
      });
    });
  }));
}

function filter_failing_urls(urls) {
  return urls.filter(t=>t);
}

function maintain_instance_list() {
  fetch_server_list().then(test_server_list).then(filter_failing_urls).then(function(urls) {
    // if we got any valid urls, replace our current set
    if (urls.length) {
      instances.length = 0;
      urls.forEach(url=>instances.push(url));
      console.log(instances.length, "instances available");
    }
    setTimeout(maintain_instance_list, check_interval);
  });
}

serve();
maintain_instance_list();
