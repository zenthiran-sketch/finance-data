import { initDb } from '../src/db/init.js';
import { runNewsFast, runSentimentMedium, aggregateTopStocks } from '../src/collectors/news/index.js';

initDb();
console.log('=== Market-wide news pipeline ===\n');
const fast = await runNewsFast();
console.log('Fast:', fast);
const medium = await runSentimentMedium();
console.log('Medium:', medium);
const top = await aggregateTopStocks(15);
console.log('\nTop 15 stocks:');
for (const t of top) {
  console.log(`  #${t.rank} ${t.symbol} — score ${Math.round(t.score)}, ${t.mentions} mentions, sent ${t.sentiment.toFixed(2)}`);
}
