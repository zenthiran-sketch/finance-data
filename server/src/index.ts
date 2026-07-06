import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import cron from 'node-cron';
import { appConfig } from './config.js';
import { initDb } from './db/init.js';
import { seed } from './db/seed.js';
import { apiRouter } from './routes/api.js';
import { refreshService } from './services/refresh.js';
import { liveStreamHub } from './live/hub.js';
import './providers/adapters.js';

async function main() {
  initDb();
  await seed();

  const app = express();
  app.use(cors({ origin: appConfig.corsOrigin }));
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = createServer(app);
  liveStreamHub.attach(server);

  cron.schedule('*/1 * * * *', () => {
    refreshService.runCycle('fast').catch(console.error);
  });

  cron.schedule('0 2 * * *', () => {
    refreshService.runCycle('daily').catch(console.error);
    import('./collectors/sentimentMacro.js').then((m) => {
      m.fetchEcondbMacro().catch(console.error);
    });
    import('./collectors/extraCollectors.js').then((m) => {
      m.fetchFearGreedIndex().catch(console.error);
      m.fetchTreasuryRates().catch(console.error);
      m.fetchCoinCapPrices().catch(console.error);
    });
  });

  cron.schedule('*/15 * * * *', () => {
    import('./collectors/news/index.js').then((m) => m.runNewsFast().catch(console.error));
  });

  cron.schedule('0 */6 * * *', () => {
    refreshService.runCycle('medium').catch(console.error);
    import('./collectors/news/index.js').then((m) => m.runSentimentMedium().catch(console.error));
  });

  cron.schedule('0 */2 * * *', () => {
    import('./collectors/news/index.js').then((m) => m.runNewsKeyed().catch(console.error));
  });

  server.listen(appConfig.port, () => {
    console.log(`Signal Terminal server on http://localhost:${appConfig.port}`);
    setTimeout(() => refreshService.runCycle('fast').catch(console.error), 2000);
    setTimeout(() => {
      import('./collectors/news/index.js').then((m) => m.runNewsFast().catch(console.error));
    }, 5000);
  });
}

main().catch(console.error);
