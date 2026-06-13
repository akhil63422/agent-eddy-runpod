import fs from 'node:fs';
import path from 'node:path';

const appPath = path.resolve(process.cwd(), 'src/App.js');
const source = fs.readFileSync(appPath, 'utf8');

const requiredRoutes = [
  'dashboard',
  'inbound',
  'outbound',
  'exceptions',
  'partners',
  'connections',
  'settings',
  'analytics',
];

const missingRoutes = requiredRoutes.filter((route) => !source.includes(`path="${route}"`) && !source.includes(`path="/${route}"`));

if (missingRoutes.length) {
  console.error('Route smoke check failed. Missing routes:', missingRoutes.join(', '));
  process.exit(1);
}

console.log('Route smoke check passed.');
