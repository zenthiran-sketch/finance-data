import { cpSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

function assertNodeVersion() {
  const [major, minor] = process.version.slice(1).split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 5)) {
    console.error(`
Node.js 22.5+ is required (built-in SQLite via node:sqlite).
Current version: ${process.version}

Install Node 22 LTS or newer: https://nodejs.org/
`);
    process.exit(1);
  }
}

function assertSqliteModule() {
  try {
    execSync('node -e "import { DatabaseSync } from \'node:sqlite\'; new DatabaseSync(\':memory:\')"', {
      cwd: root,
      stdio: 'pipe',
    });
  } catch {
    console.error(`
node:sqlite is unavailable on Node.js ${process.version}.
Use Node.js 22.5+ (LTS) or 24+.
`);
    process.exit(1);
  }
}

assertNodeVersion();
assertSqliteModule();

mkdirSync(join(root, 'data'), { recursive: true });

const envPath = join(root, '.env');
const envExample = join(root, '.env.example');
if (!existsSync(envPath) && existsSync(envExample)) {
  cpSync(envExample, envPath);
  console.log('Created .env from .env.example');
}

const sharedEntry = join(root, 'shared', 'dist', 'index.js');
if (!existsSync(sharedEntry)) {
  console.log('Building @signal-terminal/shared...');
  run('npm run build -w shared');
}
