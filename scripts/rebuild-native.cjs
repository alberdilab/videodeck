const { spawnSync } = require('node:child_process');

const electronVersion = require('electron/package.json').version;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(
  npmCommand,
  [
    'rebuild',
    'better-sqlite3',
    `--runtime=electron`,
    `--target=${electronVersion}`,
    '--disturl=https://electronjs.org/headers'
  ],
  {
    env,
    stdio: 'inherit'
  }
);

process.exit(result.status ?? 1);
