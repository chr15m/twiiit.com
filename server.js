const { URL } = require("url");
const fs = require("fs");
const process = require("process");
const util = require("util");
const express = require("express");
const morgan = require("morgan");
const rfs = require("rotating-file-stream");
const mkdirp = require("mkdirp");
const fetch = require("node-fetch");
const jsdom = require("jsdom");
const m = require("motionless");

const nitterlist_url = "https://github.com/zedeus/nitter/wiki/Instances";
const re_hostname = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const backoff_times = [5, 5, 10, 10, 20, 20, 60, 60, 120, 120, 360, 360, 720, 720, 1440, 1440, 2880, 2880];
const instances = [];
const check_interval = 1000 * 60 * 1;
const fetch_timeout = 30000;
const submission_limits = {};

function check_submission_rate(ip) {
  const now = Date.now();
  const window_ms = 10 * 60 * 1000;
  const max_requests = 10;
  const record = (submission_limits[ip] || []).filter(t => (now - t) < window_ms);
  if (record.length >= max_requests) {
    return false;
  }
  record.push(now);
  submission_limits[ip] = record;
  return true;
}

function validate_and_normalize_url(raw_url) {
  if (typeof raw_url !== "string") return null;
  let parsed;
  try {
    parsed = new URL(raw_url.trim());
  } catch (e) {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".onion") ||
      host.endsWith(".local")) {
    return null;
  }
  if (!re_hostname.test(host)) {
    return null;
  }
  return parsed.origin;
}

function handle_submission(req, raw_url) {
  const ip = req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress || "unknown";
  console.log("Submission received:", raw_url, "from IP:", ip);
  if (!check_submission_rate(ip)) {
    console.log("Submission rejected (rate limited):", ip, raw_url);
    return;
  }
  const clean_url = validate_and_normalize_url(raw_url);
  if (!clean_url) {
    console.log("Submission rejected (invalid URL):", raw_url);
    return;
  }
  if (instances.some(i => i.url === clean_url)) {
    console.log("Submission rejected (already exists):", clean_url);
    return;
  }
  console.log("Testing submitted instance candidate:", clean_url);
  const candidate = {
    url: clean_url,
    seen: null,
    backoff: {index: 0, last: 0}
  };
  test_server_list([candidate]).then(tested => {
    const passed = tested.find(i => i.url === clean_url && i.seen);
    if (passed && !instances.some(i => i.url === clean_url)) {
      instances.push(passed);
      fs.writeFile("instances.json", JSON.stringify(instances, null, 2),
        err => { if (err) console.error(err); });
      console.log("Added new instance via submission:", clean_url);
    } else {
      console.log("Submitted instance failed health checks:", clean_url);
    }
  }).catch(err => {
    console.error("Error testing submitted instance:", err);
  });
}

function index() {
  const template = m.dom(m.load("index.html"));
  const ui = template.$("main").innerHTML;
  const readme = m.load("README.md");
  const content = readme
    .replace("<!-- ui goes here -->", "<div id='ui'></div>")
    .replace("<!-- instances -->", instances.filter(i => i.seen).length);
  const dynamic = m.md(content);
  template.$("main").innerHTML = dynamic;
  template.$("#ui").innerHTML = ui;
  return template.render();
}

function load_initial_data() {
  fs.readFile("instances.json", (err, data) => {
    if (err) {
      console.log("Couldn't read instances from file.");
    } else if (data) {
      try {
        const stored_instances = JSON.parse(data.toString()) || [];
        stored_instances.forEach(inst => {
          if (typeof inst === "string") {
            instances.push({url: inst, seen: {t: Date.now(), backoff: 0}, backoff: {index: 0, last: 0}});
          } else {
            instances.push(inst);
          }
        });
        console.log("Loaded " + instances.length + " instances.");
      } catch (error) {
        console.log("Couldn't parse instances from file.");
      }
    }
  });
}

function serve() {
  const app = express();

  const port = process.env.PORT || 8000;

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

  app.use(morgan("combined", {"stream": accesslog}));

  app.get("/", (req, res) => {
    if (req.query.add !== undefined) {
      handle_submission(req, req.query.add);
      return res.type("text/plain; charset=utf-8").send("👍");
    }
    res.send(index());
  });

  app.get("/*", (req, res) => {
    // pick a random nitter instance and redirect
    const healthy_instances = instances.filter(i => i.seen);
    const instance = healthy_instances[Math.floor(Math.random() * healthy_instances.length)];
    if (instance) {
      res.redirect(instance.url + req.originalUrl);
    } else {
      res.status(421).header("Content-type", "text/plain").send("Sorry, couldn't find a Nitter instance.");
    }
  });

  app.listen(port, () => console.log("Twiiit app listening on port " + port + "."));
}

function fetch_server_list() {
  return new Promise(function(res, err) {
    // testing from a file
    /*fs.promises.readFile("instances.html")
      .then(function(f) {
        return {
          ok: true,
          text: function() { return f.toString(); }
        };
      })*/
    // download the list of nitter instances
    fetch(nitterlist_url)
      .then(function(response) {
        if (response.ok) {
          console.log("Nitter Wiki list fetch ok.");
          return response.text();
        } else {
          console.log("Nitter Wiki list fetch failed.");
          res([]);
        }
      }).then(function(page) {
      const dom = new jsdom.JSDOM(page);
      const trs = Array.from(dom.window.document.querySelectorAll("table tbody tr"));
      const trs_filtered = trs.filter(tr=>re_hostname.test(tr.querySelector("td").textContent));
      const urls = [];
      if (trs_filtered.length) {
        trs_filtered.forEach(function(row) {
          //console.log("row", row);
          const fields = Array.from(row.querySelectorAll("td"));
          //console.log("fields", fields.map(f=>f.innerHTML));
          if (fields[0] && fields[1] && fields[1].innerHTML.indexOf("✅") != -1) {
            //console.log(fields[0].innerHTML, fields[1].innerHTML);
            const a = fields[0].querySelector("a");
            if (a) {
              const href = a.getAttribute("href");
              urls.push(href.replace(/\/+$/, ""));
            }
          }
        });
      }
      console.log("Nitter Wiki list: " + urls.length + " urls.");
      urls.push("https://nitter.net");
      res(urls);
    })
    .catch(function(error) {
      console.error(error);
      res([]);
    });
  });
}

// https://dmitripavlutin.com/timeout-fetch-request/
async function fetch_with_timeout(resource, options = {}) {
  const { timeout = fetch_timeout } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const headers = Object.assign({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  }, options.headers || {});
  const response = await fetch(resource, {
    ...options,
    headers: headers,
    signal: controller.signal
  });
  clearTimeout(id);
  return response;
}

function check_for_error(page, error) {
  //console.log("Checking", error, page.indexOf(error) == -1);
  return page.indexOf(error) == -1;
}

function is_cloudflare_page(page) {
  return page.includes("/cdn-cgi/challenge-platform/") &&
    page.includes("window._cf_chl_opt") &&
    page.includes("cRay:");
}

function test_server_list(instances_to_test) {
  // test each one for overload
  return Promise.all(instances_to_test.map(function(instance) {
    return new Promise(function(res, err) {
      fetch_with_timeout(instance.url + "/jack").then(function(response) {
        if (response.ok || response.status === 403) {
          return response.text();
        } else {
          console.log(instance.url + "/jack failed to load (status " + response.status + ").");
          return null;
        }
      }).catch(function(error) {
        console.error(error);
        return null;
      }).then(function(page) {
        const error_check = page && check_for_error(page, "error-panel");
        const timeline_empty_check = page && (check_for_error(page, "timeline-none") || check_for_error(page, "No items found"));
        const timeline_item_check = page && !check_for_error(page, "timeline-item");
        const is_cloudflare = page && is_cloudflare_page(page);
        if ((page && error_check && timeline_empty_check && timeline_item_check) || is_cloudflare) {
          if (!instance.seen) console.log(instance.url + " is back online.");
          instance.seen = {t: Date.now(), backoff: instance.backoff.index};
          instance.backoff.last = Date.now();
        } else {
          const reason = !page ? "no_page" : !error_check ? "error_check" : !timeline_empty_check ? "timeline_empty_check" : "timeline_item_check";
          const old_backoff_minutes = backoff_times[instance.backoff.index];
          instance.backoff.index = Math.min(instance.backoff.index + 1, backoff_times.length - 1);
          const new_backoff_minutes = backoff_times[instance.backoff.index];
          if (instance.seen) {
            console.log(instance.url + " did not pass error checks: " + reason + ". Backing off from " + old_backoff_minutes + " to " + new_backoff_minutes + " minutes.");
          }
          instance.seen = null;
          instance.backoff.last = Date.now();
        }
        res(instance);
      });
    });
  }));
}

function maintain_instance_list() {
  console.log(new Date());
  console.log("maintain_instance_list started.");
  fetch_server_list().then(urls => {
    urls.forEach(url => {
      if (!instances.find(i => i.url === url)) {
        instances.push({url: url, seen: null, backoff: {index: 0, last: 0}});
      }
    });
    const now = Date.now();
    const to_test = instances.filter(i => {
      if (!i.backoff.last) return true;
      const backoff_minutes = backoff_times[i.backoff.index];
      const backoff_ms = backoff_minutes * 60 * 1000;
      const due = now > (i.backoff.last + backoff_ms);
      if (due && i.backoff.index > 0) {
        console.log(i.url + " backoff period expired (" + backoff_minutes + " mins), retrying.");
      }
      return due;
    });
    console.log("Testing " + to_test.length + " of " + instances.length + " total instances.");
    return test_server_list(to_test);
  }).then(() => {
    fs.writeFile("instances.json", JSON.stringify(instances, null, 2), (err) => { if (err) console.error(err); });
    const healthy_count = instances.filter(i => i.seen).length;
    console.log(healthy_count, "instances available");
    setTimeout(maintain_instance_list, check_interval);
  });
}

if (process.argv.includes("--test-site-checker")) {
  console.log("Testing instance checker.");
  fetch_server_list()
    .then(urls => urls.map(url => ({
      url: url,
      seen: null,
      backoff: {index: 0, last: 0}
    })))
    .then(test_server_list)
    .then(tested => tested.filter(i => i.seen).map(i => i.url))
    .then(console.log);
} else {
  load_initial_data();
  serve();
  maintain_instance_list();
  // restart once per day ugh
  // this is to work around persistent issues with the tasks stopping running
  setTimeout(function() { console.log("Daily restart."); process.exit(0); }, 1000 * 60 * 60 * 24);
}
