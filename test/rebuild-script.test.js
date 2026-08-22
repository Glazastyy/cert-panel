const { describe, expect, test } = require('bun:test');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'rebuild.sh');

describe('rebuild script', () => {
  test('uses Docker Compose instead of destructive legacy container commands', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');

    expect(script).toContain('docker compose');
    expect(script).not.toContain('docker rm test-pcert');
    expect(script).not.toContain('docker rmi test-pcert');
  });

  test('can initialize configuration and generate missing secrets', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');

    expect(script).toContain('init_config');
    expect(script).toContain('generate_secret');
    expect(script).toContain('SESSION_SECRET');
    expect(script).toContain('POSTGRES_PASSWORD');
    expect(script).toContain('DB_PASSWORD');
  });

  test('supports init, config, update, reboot and status commands', () => {
    const script = fs.readFileSync(scriptPath, 'utf8');

    expect(script).toContain('case "$COMMAND" in');
    expect(script).toContain('init)');
    expect(script).toContain('config)');
    expect(script).toContain('update)');
    expect(script).toContain('reboot|restart)');
    expect(script).toContain('status)');
  });

  test('creates a non-interactive env file with generated secrets and defaults', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-panel-rebuild-'));
    const envFile = path.join(tempDir, '.env');
    const result = spawnSync('bash', [scriptPath, 'config', '--yes'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ENV_FILE: envFile },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);

    const envContents = fs.readFileSync(envFile, 'utf8');

    expect(envContents).toContain('SESSION_SECRET=');
    expect(envContents).toContain('POSTGRES_PASSWORD=');
    expect(envContents).toContain('DB_PASSWORD=');
    expect(envContents).toContain('POSTGRES_DB=zerocert');
    expect(envContents).not.toContain('POSTGRES_PORT=');
    expect(envContents).toContain('DB_DIALECT=postgres');
    expect(envContents).toContain('APP_HTTP_PORT=3000');
    expect(envContents).toContain('EMAIL_PROVIDER=smtp');
    expect(envContents).toContain('RESEND_API_KEY=');
  });

  test('does not publish PostgreSQL on the host network', () => {
    const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');

    expect(compose).not.toContain('${POSTGRES_PORT');
    expect(compose).not.toContain('5432:5432');
    expect(compose).toContain('DB_HOST: postgres');
  });

  test('runs migrations inside Docker Compose with the SQLite file mounted read-only', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-panel-rebuild-migrate-'));
    const envFile = path.join(tempDir, '.env');
    const binDir = path.join(tempDir, 'bin');
    const captureFile = path.join(tempDir, 'docker-commands.txt');
    const sqlitePath = path.join(tempDir, 'database.sqlite');

    fs.mkdirSync(binDir);
    fs.writeFileSync(sqlitePath, '');
    fs.writeFileSync(path.join(binDir, 'docker'), [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$CAPTURE_FILE"'
    ].join('\n'));
    fs.chmodSync(path.join(binDir, 'docker'), 0o755);

    const result = spawnSync('bash', [scriptPath, 'migrate', sqlitePath, '--yes'], {
      cwd: path.join(__dirname, '..'),
      env: {
        CAPTURE_FILE: captureFile,
        ENV_FILE: envFile,
        PATH: `${binDir}:${process.env.PATH}`
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const capturedCommands = fs.readFileSync(captureFile, 'utf8');

    expect(capturedCommands).toContain('compose --env-file');
    expect(capturedCommands).toContain('up -d --build postgres');
    expect(capturedCommands).toContain(`-v ${sqlitePath}:/tmp/zerocert-legacy.sqlite:ro`);
    expect(capturedCommands).toContain('-e SQLITE_DB_PATH=/tmp/zerocert-legacy.sqlite');
    expect(capturedCommands).toContain('-e DB_HOST=postgres');
    expect(capturedCommands).toContain('-e DB_PORT=5432');
    expect(capturedCommands).toContain('web bun run db:migrate:sqlite-to-postgres');
  });

  test('allows explicit non-empty migration mode', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-panel-rebuild-merge-'));
    const envFile = path.join(tempDir, '.env');
    const binDir = path.join(tempDir, 'bin');
    const captureFile = path.join(tempDir, 'migration-env.txt');
    const sqlitePath = path.join(tempDir, 'database.sqlite');

    fs.mkdirSync(binDir);
    fs.writeFileSync(sqlitePath, '');
    fs.writeFileSync(path.join(binDir, 'docker'), [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$CAPTURE_FILE"'
    ].join('\n'));
    fs.chmodSync(path.join(binDir, 'docker'), 0o755);

    const result = spawnSync('bash', [scriptPath, 'migrate', sqlitePath, '--merge', '--yes'], {
      cwd: path.join(__dirname, '..'),
      env: {
        CAPTURE_FILE: captureFile,
        ENV_FILE: envFile,
        PATH: `${binDir}:${process.env.PATH}`
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(fs.readFileSync(captureFile, 'utf8')).toContain('-e MIGRATION_ALLOW_NON_EMPTY=true');
  });
});
