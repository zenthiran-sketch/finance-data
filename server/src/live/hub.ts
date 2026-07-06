import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { EventEmitter } from 'events';

export const liveEvents = new EventEmitter();

interface ClientSub {
  ws: WebSocket;
  channel: string;
  symbol?: string;
}

export class LiveStreamHub {
  private wss: WebSocketServer | null = null;
  private clients: ClientSub[] = [];
  private binanceWs: WebSocket | null = null;
  private subscribedSymbols = new Set<string>();

  attach(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/api/ws' });
    this.wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as { action: string; channel?: string; symbol?: string };
          if (msg.action === 'subscribe') {
            this.clients.push({ ws, channel: msg.channel || 'watchlist', symbol: msg.symbol });
            ws.send(JSON.stringify({ type: 'subscribed', channel: msg.channel }));
          }
        } catch { /* ignore */ }
      });
      ws.on('close', () => {
        this.clients = this.clients.filter((c) => c.ws !== ws);
      });
    });
    this.connectBinance();
  }

  updateSubscriptions(symbols: string[]) {
    this.subscribedSymbols = new Set(symbols.filter((s) => s.includes('/') || s.endsWith('USDT')));
    this.connectBinance();
  }

  private connectBinance() {
    const cryptoSyms = [...this.subscribedSymbols]
      .map((s) => s.replace('/', '').replace('USDT', '') + 'USDT')
      .filter((s) => s.endsWith('USDT'));
    if (cryptoSyms.length === 0) return;

    if (this.binanceWs) {
      this.binanceWs.close();
    }

    const streams = cryptoSyms.map((s) => `${s.toLowerCase()}@trade`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    try {
      this.binanceWs = new WebSocket(url);
      this.binanceWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as { data?: { s: string; p: string; T: number } };
          const d = msg.data;
          if (!d) return;
          const symbol = d.s.replace('USDT', '/USDT');
          const tick = {
            type: 'quote_tick',
            symbol,
            price: +d.p,
            ts: new Date(d.T).toISOString(),
            source: 'binance',
          };
          this.broadcast(tick, symbol);
          liveEvents.emit('tick', tick);
        } catch { /* ignore */ }
      });
      this.binanceWs.on('close', () => {
        setTimeout(() => this.connectBinance(), 5000);
      });
    } catch { /* ignore */ }
  }

  broadcast(tick: Record<string, unknown>, symbol?: string) {
    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      if (client.channel === 'all' || client.channel === 'watchlist' ||
          (client.channel === 'symbol' && client.symbol === symbol)) {
        client.ws.send(JSON.stringify(tick));
      }
    }
  }

  emitSignalUpdate(data: unknown) {
    this.broadcast({ type: 'signal_update', data } as Record<string, unknown>);
  }
}

export const liveStreamHub = new LiveStreamHub();
