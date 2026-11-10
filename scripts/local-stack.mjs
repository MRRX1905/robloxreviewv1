#!/usr/bin/env node
/*
 * Local, Docker-free development stack.
 *
 * Starts an embedded PostgreSQL cluster, applies the Supabase migrations, exposes
 * the database through PostgREST (the same REST layer Supabase uses) and runs the
 * roblox-lookup edge function with Deno. `--dev` additionally starts Vite against
 * this local stack instead of the hosted Supabase project.
 *
 * Usage:
 *   npm run db:local     start database + REST + functions
 *   npm run dev:local    start everything, including the app on http://127.0.0.1:5173
 *   npm run db:reset     wipe the local cluster and re-apply every migration
 */
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localDir = path.join(root, '.local-db');
const binDir = path.join(localDir, 'bin');
const dataDir = path.join(localDir, 'pgdata');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const functionEntry = path.join(root, 'supabase', 'functions', 'roblox-lookup', 'index.ts');
// PostgREST links against libpq, which ships with the embedded PostgreSQL build.
const postgresBinDir = path.join(
  root, 'node_modules', '@embedded-postgres', 'windows-x64', 'native', 'bin',
);
const POSTGREST_VERSION = 'v16.5';
const POSTGREST_ZIP_URL = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-windows-x86-64.zip`;

const flags = new Set(process.argv.slice(2));
const reset = flags.has('--reset');
const withDev = flags.has('--dev');

const PG_PORT = portFromEnv('LOCAL_PG_PORT', 54322);
const REST_PORT = portFromEnv('LOCAL_REST_PORT', 54324);
const FUNCTION_PORT = portFromEnv('LOCAL_FUNCTIONS_PORT', 54325);
// Same port Supabase's API gateway uses, so the app keeps one base URL.
const GATEWAY_PORT = portFromEnv('LOCAL_API_PORT', 54321);
const APP_PORT = portFromEnv('LOCAL_APP_PORT', 5173);

const children = new Set();
let postgres = null;
let gateway = null;
let shuttingDown = false;

function portFromEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function log(message) {
  console.log(`[local] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectionString() {
  return `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function signToken(role, secret, expiresInSeconds = 60 * 60 * 24 * 365) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    role,
    iss: 'local-development',
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }));
  const body = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

async function loadSecrets() {
  const file = path.join(localDir, 'secrets.json');
  if (existsSync(file)) {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (typeof saved.jwtSecret === 'string' && saved.jwtSecret.length >= 32) return saved;
  }
  const secrets = {
    jwtSecret: randomBytes(32).toString('hex'),
    anonKey: '',
    serviceRoleKey: '',
  };
  secrets.anonKey = signToken('anon', secrets.jwtSecret);
  secrets.serviceRoleKey = signToken('service_role', secrets.jwtSecret);
  await writeFile(file, JSON.stringify(secrets, null, 2));
  return secrets;
}

async function connect() {
  let lastError = null;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const client = new pg.Client({ connectionString: connectionString() });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await sleep(500);
    }
  }
  throw new Error(`PostgreSQL did not accept connections: ${lastError?.message ?? 'unknown error'}`);
}

async function ensureRoles() {
  const client = await connect();
  try {
    for (const role of ['anon', 'authenticated']) {
      const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
      if (existing.rowCount === 0) await client.query(`CREATE ROLE ${role} NOLOGIN`);
    }
    const service = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', ['service_role']);
    if (service.rowCount === 0) await client.query('CREATE ROLE service_role NOLOGIN BYPASSRLS');
    await client.query('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role');
    await client.query('GRANT ALL ON SCHEMA public TO postgres');
  } finally {
    await client.end();
  }
}

async function resetSchema() {
  const client = await connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO postgres');
    await client.query('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role');
    log('public schema reset');
  } finally {
    await client.end();
  }
}

async function applyMigrations() {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  const client = await connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS local_meta');
    await client.query(`
      CREATE TABLE IF NOT EXISTS local_meta.migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const appliedRows = await client.query('SELECT name FROM local_meta.migrations');
    const applied = new Set(appliedRows.rows.map((row) => row.name));

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      log(`applying migration ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO local_meta.migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${error.message}`);
      }
    }
    log(`database schema is up to date (${files.length} migration file(s))`);
  } finally {
    await client.end();
  }
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`PowerShell exited with ${code}: ${output.slice(0, 400)}`));
    });
  });
}

async function ensurePostgrest() {
  const existing = path.join(binDir, 'postgrest.exe');
  if (existsSync(existing)) return existing;

  await mkdir(binDir, { recursive: true });
  const archive = path.join(binDir, 'postgrest.zip');
  log(`downloading PostgREST ${POSTGREST_VERSION} (one time)`);
  const response = await fetch(POSTGREST_ZIP_URL, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`PostgREST download failed with HTTP ${response.status}`);
  }
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  log('extracting PostgREST');
  await runPowerShell(`Expand-Archive -LiteralPath '${archive}' -DestinationPath '${binDir}' -Force`);
  await rm(archive, { force: true });

  if (existsSync(existing)) return existing;
  const entries = await readdir(binDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = path.join(binDir, entry.name, 'postgrest.exe');
      if (existsSync(nested)) {
        await writeFile(existing, await readFile(nested));
        return existing;
      }
    }
  }
  throw new Error('PostgREST executable was not found after extraction');
}

async function startPostgrest(secrets) {
  const executable = await ensurePostgrest();
  const configPath = path.join(localDir, 'postgrest.conf');
  const config = [
    `db-uri = "postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres"`,
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    'db-extra-search-path = "public"',
    `jwt-secret = "${secrets.jwtSecret}"`,
    'server-host = "127.0.0.1"',
    `server-port = ${REST_PORT}`,
    'server-cors-allowed-origins = "*"',
    'log-level = "warn"',
    '',
  ].join('\n');
  await writeFile(configPath, config);

  const child = spawn(executable, [configPath], {
    cwd: localDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      PATH: `${postgresBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
    },
  });
  children.add(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[postgrest] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[postgrest] ${chunk}`));
  child.on('exit', (code) => {
    children.delete(child);
    if (!shuttingDown) log(`PostgREST stopped unexpectedly (exit ${code})`);
  });
  return child;
}

async function resolveDenoEntry() {
  const packageDir = path.join(root, 'node_modules', 'deno');
  const manifest = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.deno;
  if (!bin) throw new Error('The deno package does not expose a CLI entry point');
  return path.join(packageDir, bin);
}

async function startFunctionServer(secrets) {
  const denoEntry = await resolveDenoEntry();
  const child = spawn(
    process.execPath,
    [denoEntry, 'run', '--allow-all', '--quiet', functionEntry],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(FUNCTION_PORT),
        SUPABASE_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
        SUPABASE_SERVICE_ROLE_KEY: secrets.serviceRoleKey,
      },
    },
  );
  children.add(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[functions] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[functions] ${chunk}`));
  child.on('exit', (code) => {
    children.delete(child);
    if (!shuttingDown) log(`lookup function stopped unexpectedly (exit ${code})`);
  });
  return child;
}

function startVite(secrets) {
  const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(viteEntry)) throw new Error('Vite is not installed; run npm install first');
  const child = spawn(
    process.execPath,
    [viteEntry, '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_SUPABASE_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
        VITE_SUPABASE_ANON_KEY: secrets.anonKey,
      },
    },
  );
  children.add(child);
  child.on('exit', (code) => {
    children.delete(child);
    if (!shuttingDown) log(`app dev server stopped (exit ${code})`);
  });
  return child;
}

/**
 * Supabase serves PostgREST and edge functions behind one gateway:
 * `/rest/v1/*` and `/functions/v1/*`. PostgREST itself has no path prefix, so
 * this small proxy provides the same URLs the app already uses.
 */
function startGateway() {
  const server = http.createServer((request, response) => {
    const url = request.url ?? '/';
    let targetPort = null;
    let targetPath = url;

    if (url === '/rest/v1' || url.startsWith('/rest/v1/') || url.startsWith('/rest/v1?')) {
      targetPort = REST_PORT;
      targetPath = url.slice('/rest/v1'.length) || '/';
    } else if (
      url === '/functions/v1'
      || url.startsWith('/functions/v1/')
      || url.startsWith('/functions/v1?')
    ) {
      targetPort = FUNCTION_PORT;
      targetPath = url.slice('/functions/v1'.length) || '/';
    }

    if (targetPort === null) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found in the local Supabase gateway.' }));
      return;
    }

    const upstream = http.request({
      host: '127.0.0.1',
      port: targetPort,
      method: request.method,
      path: targetPath,
      headers: request.headers,
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });

    upstream.on('error', (error) => {
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'application/json' });
      }
      response.end(JSON.stringify({ error: error.message }));
    });
    request.pipe(upstream);
  });
  server.listen(GATEWAY_PORT, '127.0.0.1');
  gateway = server;
  return server;
}

async function waitFor(label, url, init, attempts = 80) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.status < 500) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  child.kill('SIGTERM');
}

async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`shutting down${reason ? ` (${reason})` : ''}`);
  for (const child of [...children]) killTree(child);
  await sleep(300);
  if (gateway) gateway.close();
  if (postgres) {
    await postgres.stop().catch(() => undefined);
  }
  process.exit(0);
}

async function main() {
  await mkdir(localDir, { recursive: true });
  const secrets = await loadSecrets();

  if (reset) {
    log('removing the local cluster for a clean reset');
    await rm(dataDir, { recursive: true, force: true });
  }

  log(`starting embedded PostgreSQL on 127.0.0.1:${PG_PORT}`);
  postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PG_PORT,
    persistent: true,
    // The machine locale defaults to WIN1252, which cannot store Roblox bios,
    // emoji or non-Latin usernames. The app stores all of these.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    log('initialising a new PostgreSQL cluster');
    await postgres.initialise();
  }
  await postgres.start();

  if (reset) await resetSchema();
  await ensureRoles();
  await applyMigrations();

  await startPostgrest(secrets);
  await waitFor('PostgREST', `http://127.0.0.1:${REST_PORT}/rest/v1/`, {
    headers: { apikey: secrets.anonKey, Authorization: `Bearer ${secrets.anonKey}` },
  });
  log(`REST API ready on http://127.0.0.1:${REST_PORT}/rest/v1`);

  await startFunctionServer(secrets);
  await waitFor('lookup function', `http://127.0.0.1:${FUNCTION_PORT}/functions/v1/roblox-lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secrets.anonKey}` },
    body: JSON.stringify({ username: 'x' }),
  });
  log(`lookup function ready on http://127.0.0.1:${FUNCTION_PORT}/functions/v1/roblox-lookup`);

  startGateway();
  await waitFor('local API gateway', `http://127.0.0.1:${GATEWAY_PORT}/rest/v1/`, {
    headers: { apikey: secrets.anonKey, Authorization: `Bearer ${secrets.anonKey}` },
  });
  log(`API ready on http://127.0.0.1:${GATEWAY_PORT}`);

  await writeFile(path.join(localDir, 'connection.json'), JSON.stringify({
    database: connectionString(),
    apiUrl: `http://127.0.0.1:${GATEWAY_PORT}`,
    restUrl: `http://127.0.0.1:${GATEWAY_PORT}/rest/v1`,
    functionsUrl: `http://127.0.0.1:${GATEWAY_PORT}/functions/v1`,
    anonKey: secrets.anonKey,
    serviceRoleKey: secrets.serviceRoleKey,
  }, null, 2));

  log('local stack is ready');
  log(`Postgres   ${connectionString()}`);
  log(`API        http://127.0.0.1:${GATEWAY_PORT}`);
  log(`REST       http://127.0.0.1:${GATEWAY_PORT}/rest/v1`);
  log(`Functions  http://127.0.0.1:${GATEWAY_PORT}/functions/v1`);

  if (withDev) {
    startVite(secrets);
    log(`app        http://127.0.0.1:${APP_PORT}`);
  } else {
    log('run "npm run dev:local" to start the app against this database');
  }

  await new Promise(() => undefined);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error('[local] fatal:', error);
  void shutdown('error');
});

main().catch(async (error) => {
  console.error('[local] failed to start:', error);
  await shutdown('startup failure');
});
