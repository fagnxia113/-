import React, { useEffect, useRef, useState } from 'react';
import { init, dispose, type Chart } from 'klinecharts';
import { Card } from '../common';
import type { ReportLanguage } from '../../types/analysis';
import { normalizeReportLanguage } from '../../utils/reportLanguage';

interface KLineDataItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  amount?: number | null;
  change_percent?: number | null;
}

interface KlineChartViewProps {
  stockCode: string;
  stockName?: string;
  language?: ReportLanguage;
  period?: 'daily' | 'weekly' | 'monthly';
  days?: number;
}

const API_BASE = import.meta.env.VITE_API_BASE || '';

const PERIOD_MAP: Record<string, { type: 'day' | 'week' | 'month'; span: number }> = {
  daily: { type: 'day', span: 1 },
  weekly: { type: 'week', span: 1 },
  monthly: { type: 'month', span: 1 },
};

export const KlineChartView: React.FC<KlineChartViewProps> = ({
  stockCode,
  stockName,
  language = 'zh',
  period = 'daily',
  days = 120,
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const isEn = reportLanguage === 'en';
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<'daily' | 'weekly' | 'monthly'>(period);
  const fetchRef = useRef<{ code: string; period: string; days: number }>({
    code: stockCode,
    period: activePeriod,
    days,
  });

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = init(chartContainerRef.current);
    if (!chart) return;
    chartRef.current = chart;

    chart.setStyles({
      grid: {
        show: true,
        horizontal: { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed' as const },
        vertical: { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed' as const },
      },
      candle: {
        priceMark: { last: { show: true } },
        bar: {
          upColor: '#ef4444',
          downColor: '#22c55e',
          upBorderColor: '#ef4444',
          downBorderColor: '#22c55e',
          upWickColor: '#ef4444',
          downWickColor: '#22c55e',
        },
      },
      xAxis: {
        axisLine: { show: true, color: 'rgba(255,255,255,0.08)' },
        tickLine: { show: true, size: 1, length: 3, color: 'rgba(255,255,255,0.08)' },
        tickText: { show: true, color: 'rgba(255,255,255,0.35)', size: 10 },
      },
      yAxis: {
        axisLine: { show: true, color: 'rgba(255,255,255,0.08)' },
        tickLine: { show: true, size: 1, length: 3, color: 'rgba(255,255,255,0.08)' },
        tickText: { show: true, color: 'rgba(255,255,255,0.35)', size: 10 },
      },
    });

    chart.createIndicator('MA', false, { id: 'candle_pane' });
    chart.createIndicator('VOL');
    chart.createIndicator('MACD');

    chart.setDataLoader({
      getBars: async (params) => {
        const { code, period: p, days: d } = fetchRef.current;
        try {
          setLoading(true);
          setError(null);
          const url = `${API_BASE}/api/v1/stocks/${code}/history?period=${p}&days=${d}`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const json = await resp.json();
          const raw: KLineDataItem[] = json?.data ?? [];
          if (!raw.length) {
            setError(isEn ? 'No K-line data available' : '暂无K线数据');
            params.callback([], { backward: false, forward: false });
            return;
          }
          const klineData = raw.map((item) => ({
            timestamp: new Date(item.date).getTime(),
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume ?? undefined,
          }));
          params.callback(klineData, { backward: false, forward: false });
        } catch {
          setError(isEn ? 'Failed to load chart data' : '图表数据加载失败');
          params.callback([], { backward: false, forward: false });
        } finally {
          setLoading(false);
        }
      },
    });

    chart.setSymbol({ ticker: stockCode });
    chart.setPeriod(PERIOD_MAP[activePeriod]);

    const onResize = () => { chart.resize(); };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (chartContainerRef.current) { dispose(chartContainerRef.current); }
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    fetchRef.current = { code: stockCode, period: activePeriod, days };
    if (chartRef.current) {
      chartRef.current.setSymbol({ ticker: stockCode });
      chartRef.current.setPeriod(PERIOD_MAP[activePeriod]);
    }
  }, [stockCode, activePeriod, days]);

  const periodOptions = [
    { value: 'daily' as const, label: isEn ? 'Daily' : '日K' },
    { value: 'weekly' as const, label: isEn ? 'Weekly' : '周K' },
    { value: 'monthly' as const, label: isEn ? 'Monthly' : '月K' },
  ];

  return (
    <Card variant="bordered" padding="md" className="home-panel-card text-left">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-gradient-to-b from-red-500 to-green-500" />
          <h3 className="text-sm font-medium tracking-wide text-foreground">
            {isEn ? 'K-Line Chart' : 'K线走势图'}
          </h3>
          {stockName && (
            <span className="text-xs text-secondary-text">
              {stockName} · {stockCode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setActivePeriod(opt.value)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                activePeriod === opt.value
                  ? 'bg-primary/20 text-primary font-medium'
                  : 'text-secondary-text hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height: 420 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-card/60">
            <div className="flex items-center gap-2 text-secondary-text">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs">{isEn ? 'Loading...' : '加载中...'}</span>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className="text-xs text-muted-text">{error}</span>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </Card>
  );
};
