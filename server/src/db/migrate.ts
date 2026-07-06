import { initDb } from './init.js';
import { seed } from './seed.js';

initDb();
seed().then(() => console.log('Migration and seed complete')).catch(console.error);
