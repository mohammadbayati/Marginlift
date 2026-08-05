const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.MARGINLIFT_DB = path.join(os.tmpdir(), `marginlift-test-${Date.now()}.json`);

const { start } = require("../src/server");

function waitForListening(server) {
  if (server.listening) return Promise.resolve();
  return new Promise(resolve => server.once("listening", resolve));
}

async function readResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

async function run() {
  const server = start(0);
  await waitForListening(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(route, options = {}) {
    const headers = {};
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.cookie) headers.Cookie = options.cookie;

    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    return {
      response,
      payload: await readResponse(response),
      cookie: response.headers.get("set-cookie")
    };
  }

  try {
    const health = await request("/api/health");
    assert.strictEqual(health.response.status, 200);

    const login = await request("/api/auth/login", {
      method: "POST",
      body: {
        email: "growth@example.com",
        password: "demo1234"
      }
    });
    assert.strictEqual(login.response.status, 200);
    assert.ok(login.cookie);

    const cookie = login.cookie.split(";")[0];
    const event = await request("/api/events", {
      method: "POST",
      cookie,
      body: {
        event: "campaign_imported",
        properties: {
          campaign_name: "Integration test",
          has_file: true
        }
      }
    });
    assert.strictEqual(event.response.status, 201);

    const summary = await request("/api/events/summary", { cookie });
    assert.strictEqual(summary.response.status, 200);
    assert.ok(summary.payload.data.totalEvents >= 1);
    assert.ok(summary.payload.data.funnel.some(item => item.event === "campaign_imported" && item.count >= 1));
    assert.ok(summary.payload.data.latest.some(item => item.event === "campaign_imported"));

    const report = await request("/api/campaigns/current/report", { cookie });
    assert.strictEqual(report.response.status, 200);
    assert.ok(String(report.payload).includes("# گزارش MarginLift"));
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (fs.existsSync(process.env.MARGINLIFT_DB)) fs.unlinkSync(process.env.MARGINLIFT_DB);
  }
}

run()
  .then(() => console.log("server.test.js passed"))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
