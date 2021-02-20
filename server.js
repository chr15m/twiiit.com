const express = require("express");
const morgan = require("morgan");
const rfs = require("rotating-file-stream");
const mkdirp = require("mkdirp");

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

// download the list of nitter instances
// test each one for overload

