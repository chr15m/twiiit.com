#!/usr/bin/env node

const assert = require("assert");
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");

const TEST_PORT = parseInt(process.env.TEST_PORT || "8001", 10);
const BASE_URL = `http://localhost:${TEST_PORT}`;

function waitForPort(port, timeout_ms = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      const socket = net.createConnection({ port: port, host: "127.0.0.1" });
      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeout_ms) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 100);
        }
      });
    }
    tryConnect();
  });
}

function testRequest(param) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/?add=${encodeURIComponent(param)}`;
    http.get(url, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({ status: res.statusCode, body: data });
      });
    }).on("error", reject);
  });
}

async function run() {
  const server = spawn("node", ["server.js"], {
    env: { ...process.env, PORT: TEST_PORT },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  server.stdout.setEncoding("utf8");
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });

  function waitForSubmissionResult(timeout_ms = 3000) {
    const start = Date.now();
    const result_pattern =
      /(Testing submitted instance candidate: [^\n\r]+|Submission rejected \([^)]+\): [^\n\r]+)/;
    return new Promise((resolve, reject) => {
      function check() {
        const match = serverOutput.match(result_pattern);
        if (match) {
          resolve(match[1]);
        } else if (Date.now() - start > timeout_ms) {
          reject(new Error(`Timeout waiting for submission result. Log:\n${serverOutput}`));
        } else {
          setTimeout(check, 10);
        }
      }
      check();
    });
  }

  try {
    server.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.error(`Server process exited with code ${code}`);
      }
    });

    await waitForPort(TEST_PORT);

    const cases = [
      {
        name: "valid URL candidate",
        input: "https://shitter.thepixora.com",
        expected:
          "Testing submitted instance candidate: https://shitter.thepixora.com"
      },
      {
        name: "reject localhost",
        input: "http://localhost:8000",
        expected: "Submission rejected (invalid URL): http://localhost:8000"
      },
      {
        name: "reject .onion domain",
        input: "http://example.onion",
        expected: "Submission rejected (invalid URL): http://example.onion"
      },
      {
        name: "reject .cf domain",
        input: "https://example.cf",
        expected: "Submission rejected (invalid URL): https://example.cf"
      },
      {
        name: "reject invalid syntax",
        input: "not-a-url",
        expected: "Submission rejected (invalid URL): not-a-url"
      }
    ];

    for (const tc of cases) {
      serverOutput = "";
      const res = await testRequest(tc.input);
      assert.strictEqual(res.status, 200, `${tc.name}: expected HTTP 200`);
      assert.strictEqual(res.body, "👍", `${tc.name}: expected 👍 body`);
      const actual = await waitForSubmissionResult();
      assert.strictEqual(actual, tc.expected, `${tc.name}: log mismatch`);
      console.log(`PASS: ${tc.name}`);
    }

    console.log("All submission tests passed.");
  } finally {
    server.kill("SIGTERM");
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
