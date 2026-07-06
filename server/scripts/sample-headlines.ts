import { getDb, schema } from '../src/db/index.js';
import { appConfig } from '../src/config.js';
import { desc, inArray } from 'drizzle-orm';

const db = getDb(appConfig.databasePath);
const rss = await db.select().from(schema.tsEvents)
  .where(inArray(schema.tsEvents.source, ['bloomberg', 'yahoo', 'cnn', 'cnbc']))
  .orderBy(desc(schema.tsEvents.ts))
  .limit(8);
console.log('Financial RSS headlines in DB:');
for (const e of rss) {
  console.log(`  [${e.source}] ${e.entityId}: ${(e.title || '').slice(0, 75)}`);
  if (e.url) console.log(`    ${e.url.slice(0, 80)}`);
}
