import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

if (!existsSync(join(root, 'node_modules'))) {
  console.log('First run: installing dependencies...');
  run('npm install');
}

run('node scripts/setup.mjs');

console.log('\nSignal Terminal');
console.log('  Dashboard: http://localhost:5173');
console.log('  API:       http://localhost:3001/api\n');

run('npm run dev');
