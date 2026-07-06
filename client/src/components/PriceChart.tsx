import { useEffect, useRef, useCallback } from 'react';
import {
  createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries,
  createSeriesMarkers, type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi,
  type UTCTimestamp,
} from 'lightweight-charts';

export interface Bar {
  ts: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number | null;
}

export interface SignalMarker {
  computedAt: string;
  signal: string;
  confidence: number;
}

interface PriceChartProps {
  bars: Bar[];
  signals?: SignalMarker[];
  height?: number;
}

function toUnix(ts: string): UTCTimestamp {
  return Math.floor(new Date(ts).getTime() / 1000) as UTCTimestamp;
}

export default function PriceChart({ bars, signals = [], height = 420 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null);

  const render = useCallback(() => {
    if (!containerRef.current || bars.length === 0) return;

    if (!chartRef.current) {
      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: '#10151f' },
          textColor: '#7e8aa0',
          fontFamily: "'JetBrains Mono', monospace",
        },
        grid: {
          vertLines: { color: '#1a2233' },
          horzLines: { color: '#1a2233' },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#212a3b' },
        timeScale: { borderColor: '#212a3b', timeVisible: true },
        width: containerRef.current.clientWidth,
        height,
      });
      chartRef.current = chart;

      candleRef.current = chart.addSeries(CandlestickSeries, {
        upColor: '#1fd65f',
        downColor: '#ff5a5f',
        borderUpColor: '#1fd65f',
        borderDownColor: '#ff5a5f',
        wickUpColor: '#1fd65f',
        wickDownColor: '#ff5a5f',
      });

      volumeRef.current = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });

      markersRef.current = createSeriesMarkers(candleRef.current) as ISeriesMarkersPluginApi<UTCTimestamp>;
    }

    const candleData = bars.map((b) => {
      const c = b.close;
      const o = b.open ?? c;
      const h = b.high ?? Math.max(o, c);
      const l = b.low ?? Math.min(o, c);
      return { time: toUnix(b.ts), open: o, high: h, low: l, close: c };
    });

    const volumeData = bars
      .filter((b) => b.volume != null && b.volume > 0)
      .map((b) => ({
        time: toUnix(b.ts),
        value: b.volume!,
        color: (b.close >= (b.open ?? b.close) ? 'rgba(31,214,95,0.35)' : 'rgba(255,90,95,0.35)'),
      }));

    candleRef.current?.setData(candleData);
    volumeRef.current?.setData(volumeData);

    const markerData = signals.map((s) => {
      const isBuy = s.signal.includes('BUY');
      const isSell = s.signal.includes('SELL');
      return {
        time: toUnix(s.computedAt.slice(0, 10)),
        position: (isBuy ? 'belowBar' : isSell ? 'aboveBar' : 'inBar') as 'belowBar' | 'aboveBar' | 'inBar',
        color: isBuy ? '#1fd65f' : isSell ? '#ff5a5f' : '#8893a6',
        shape: (isBuy ? 'arrowUp' : isSell ? 'arrowDown' : 'circle') as 'arrowUp' | 'arrowDown' | 'circle',
        text: `${s.signal} ${s.confidence}%`,
      };
    });
    markersRef.current?.setMarkers(markerData);

    chartRef.current?.timeScale().fitContent();
  }, [bars, signals, height]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    const onResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      markersRef.current = null;
    };
  }, []);

  if (bars.length === 0) {
    return (
      <div className="chart-empty" style={{ height }}>
        <span>No price data available</span>
      </div>
    );
  }

  return <div ref={containerRef} className="price-chart" />;
}
