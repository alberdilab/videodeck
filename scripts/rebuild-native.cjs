const { spawnSync } = require('node:child_process');

const electronVersion = require('electron/package.json').version;
const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
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
    stdio: 'inherit',
    // Node refuses to spawn .cmd/.bat shims without a shell, so npm.cmd would
    // fail with EINVAL before it ever runs.
    shell: isWindows
  }
);

if (result.error) {
  console.error(`Failed to run ${npmCommand} rebuild: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
