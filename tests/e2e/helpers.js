// Shared helpers for the browser tests: a static server for the repo, an optional local PostgREST in front of a dev
// database, and a Playwright context that records (or forwards) every request the app makes to Supabase.
// Setup and environment variables: tests/README.md.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".css": "text/css", ".ics": "text/calendar" };

// Serves the repo. `overrides` maps a path ("/sw.js") to replacement content, to test upgrades.
function serve(port = 0) {
  const overrides = new Map();
  let delayMs = 0;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith("/")) p += "index.html";
    const send = () => {
      if (overrides.has(p)) {
        res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-cache" });
        return res.end(overrides.get(p));
      }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" });
      fs.createReadStream(f).pipe(res);
    };
    if (delayMs && req.headers["sec-fetch-mode"] === "navigate") setTimeout(send, delayMs); else send();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({
    url: `http://localhost:${server.address().port}/`,
    override: (p, content) => (content == null ? overrides.delete(p) : overrides.set(p, content)),
    slowPages: (ms) => { delayMs = ms; },
    close: () => new Promise((r) => server.close(r))
  })));
}

// ---- dev database + PostgREST (only for tests that need them) ----
const DB_ADMIN = process.env.DEV_DB_ADMIN_URL || "postgres://mwtest:dev-only@localhost:5432/postgres";
const dbUrl = (name) => DB_ADMIN.replace(/\/[^/]*$/, "/" + name);
const psql = (url, args, input) => execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", url, ...args],
  { input, cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] }).toString();
// A fresh database shaped like production (main's setup.sql), then both migrations
function freshDb(name) {
  psql(DB_ADMIN, ["-c", `drop database if exists ${name} with (force)`, "-c", `create database ${name}`]);
  const url = dbUrl(name);
  for (const f of ["tests/db/supabase_roles.sql", "tests/db/fixtures/production_baseline_main.sql",
    "supabase/migrations/20261004000000_intention_routine.sql", "supabase/migrations/20261005000000_reliability_metrics.sql"]) {
    psql(url, ["-f", f]);
  }
  return url;
}
const query = (url, sql) => psql(url, ["-tA", "-F", "|", "-c", sql]).trim();

async function postgrest(dbName, port = 3999) {
  const bin = process.env.POSTGREST_BIN || "postgrest";
  const authUrl = (process.env.DEV_DB_AUTH_URL || "postgres://authenticator:dev-only@localhost:5432/") + dbName;
  const proc = spawn(bin, [], { env: { ...process.env, PGRST_DB_URI: authUrl, PGRST_DB_ANON_ROLE: "anon",
    PGRST_DB_SCHEMAS: "public", PGRST_SERVER_PORT: String(port), PGRST_LOG_LEVEL: "crit" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; proc.stdout.on("data", (d) => (log += d)); proc.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base + "/"); if (r.status < 500) return { base, stop: () => proc.kill(), log: () => log }; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error("PostgREST didn't start: " + log);
}

// ---- browser context ----
// rest:   forward stats requests to this PostgREST base URL (otherwise answered 201 locally)
// status: (n, rows) => code, to inject failures. "lost" forwards the request, then tells the app it failed.
async function ctx(browser, base, opt = {}) {
  const { devices } = require("playwright");
  const c = await browser.newContext({ ...devices[opt.device || "Pixel 7"], colorScheme: opt.scheme || "light",
    ...(opt.timezoneId ? { timezoneId: opt.timezoneId } : {}), ...(opt.storageState ? { storageState: opt.storageState } : {}),
    ...(opt.offline ? { offline: true } : {}), serviceWorkers: opt.serviceWorkers || "block" });
  await c.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  const bodies = [], sent = [], urls = [];
  let n = 0;
  await c.route(/supabase\.co/, async (route) => {
    const req = route.request();
    const body = req.postData() || "";
    let rows = []; try { rows = JSON.parse(body || "[]"); } catch {}
    bodies.push(body); urls.push(req.url());
    if (opt.hold) await opt.hold(n, rows);
    const code = opt.status ? opt.status(n, rows) : 201;
    n++;
    if (opt.rest && (code === "lost" || code < 300)) {
      const u = new URL(req.url());
      const res = await route.fetch({ url: opt.rest + u.pathname.replace(/^\/rest\/v1/, "") + u.search, headers: req.headers() });
      if (code === "lost") return route.fulfill({ status: 503, body: "" });
      if (res.status() < 300) sent.push(rows);
      return route.fulfill({ response: res });
    }
    if (typeof code === "number" && code < 300) sent.push(rows);
    return route.fulfill({ status: code === "lost" ? 503 : code, body: "" });
  });
  await c.route(/calendar\.google\.com/, (r) => r.fulfill({ status: 200, body: "ok" }));
  if (opt.init) await c.addInitScript(opt.init, opt.initArg);
  const p = await c.newPage();
  if (opt.when) await p.clock.install({ time: new Date(opt.when) });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const t = (ms) => (opt.when ? p.clock.runFor(ms) : p.waitForTimeout(ms));
  const ls = (k) => p.evaluate((k) => { const v = localStorage.getItem("fl." + k); return v == null ? null : JSON.parse(v); }, k);
  const rows = () => sent.flat();
  const kinds = () => rows().map((r) => r.kind);
  return { c, p, t, ls, rows, kinds, bodies, urls, errs, goto: async (q = "") => { await p.goto(base + q); await t(700); } };
}

// The routine, step by step (each waits past the 500 ms double-tap guard)
const steps = {
  begin: async (x) => { await x.p.click("#begin"); await x.t(700); },
  breatheAll: async (x) => { await x.t(31000); },
  skipBreathing: async (x) => { await x.p.click("#bskip"); await x.t(700); },
  keep: async (x) => { await x.p.click("#isave"); await x.t(700); },
  skipTasks: async (x) => { await x.p.click("#iskip"); await x.t(700); },
  finish: async (x) => { await x.p.click("#finish"); await x.t(700); },
  untickAll: async (x) => { for (const b of await x.p.$$('.chip.pick[aria-pressed="true"]')) await b.click(); }
};

// Results: one line per check, PASS or FAIL, and the exit code says whether all passed
function reporter(title) {
  const lines = [];
  const ok = (name, cond, info = "") => lines.push(`${cond ? "PASS" : "FAIL"}  ${name}${info !== "" && !cond ? "  — " + (typeof info === "string" ? info : JSON.stringify(info)) : ""}`);
  const done = () => {
    const fails = lines.filter((l) => l.startsWith("FAIL")).length;
    console.log(`# ${title}\n${lines.join("\n")}\n${lines.length - fails}/${lines.length} passed\n`);
    process.exitCode = fails ? 1 : 0;
  };
  return { ok, done };
}

module.exports = { ROOT, serve, freshDb, query, postgrest, ctx, steps, reporter, dbUrl };
