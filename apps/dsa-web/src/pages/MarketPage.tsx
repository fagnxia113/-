import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { init, dispose, type Chart } from 'klinecharts';
import { StockAutocomplete } from '../components/StockAutocomplete';
import { stocksApi, formulaApi, type StockQuote, type OrderBookResponse, type TradeTicksResponse } from '../api/stocks';

type WatchlistItem = {
  code: string;
  name?: string;
};

const STORAGE_KEY = 'dsa_watchlist';

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { code: '600519', name: '贵州茅台' },
  { code: '300750', name: '宁德时代' },
  { code: '002594', name: '比亚迪' },
  { code: '601318', name: '中国平安' },
  { code: '000858', name: '五粮液' },
];

function loadWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_WATCHLIST;
}

function saveWatchlist(items: WatchlistItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

const PERIOD_MAP: Record<string, { type: 'day' | 'week' | 'month'; span: number }> = {
  daily: { type: 'day', span: 1 },
  weekly: { type: 'week', span: 1 },
  monthly: { type: 'month', span: 1 },
};

const PERIODS = [
  { value: 'daily', label: '日K' },
  { value: 'weekly', label: '周K' },
  { value: 'monthly', label: '月K' },
];

const INDICATOR_LIST = [
  { key: 'MACD', display: 'MACD', color: '#9b59b6' },
  { key: 'KDJ', display: 'KDJ', color: '#e67e22' },
  { key: 'RSI', display: 'RSI', color: '#2ecc71' },
  { key: 'BOLL', display: 'BOLL', color: '#3498db' },
  { key: 'ZHU_LI_SHA_ZHUANG', display: '主力杀庄', color: '#e74c3c' },
  { key: 'CAPITAL_FLOW', display: '资金流向', color: '#1abc9c' },
];

function fmtVol(v: number | null | undefined): string {
  if (v == null) return '--';
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万';
  return v.toLocaleString();
}

function fmtAmt(a: number | null | undefined): string {
  if (a == null) return '--';
  if (a >= 1e8) return (a / 1e8).toFixed(2) + '亿';
  if (a >= 1e4) return (a / 1e4).toFixed(2) + '万';
  return a.toLocaleString();
}

function fmtP(p: number | null | undefined): string {
  if (p == null) return '--';
  return p.toFixed(2);
}

function fmtHand(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(1) + '万';
  return v.toString();
}

function pColor(price: number, ref: number): string {
  if (price > ref) return 'text-red-500';
  if (price < ref) return 'text-green-500';
  return 'text-secondary-text';
}

const Spinner = ({ size = 3 }: { size?: number }) => (
  <svg className={`h-${size} w-${size} animate-spin`} viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

function toPureCode(code: string): string {
  return code.replace(/\.(SZ|SH|BJ|SS)$/i, '');
}

const MarketPage: React.FC = () => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(loadWatchlist);
  const [selectedCode, setSelectedCode] = useState('600519');
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState('daily');
  const [quotesMap, setQuotesMap] = useState<Record<string, StockQuote>>({});
  const [activeIndicator, setActiveIndicator] = useState<string | null>(null);
  const [indicatorOutputs, setIndicatorOutputs] = useState<Record<string, (number | null)[]> | null>(null);
  const [indicatorLoading, setIndicatorLoading] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [orderbook, setOrderbook] = useState<OrderBookResponse | null>(null);
  const [ticksData, setTicksData] = useState<TradeTicksResponse | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [sidebarSearchValue, setSidebarSearchValue] = useState('');

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<Chart | null>(null);
  const fetchRef = useRef({ code: '600519', period: 'daily' });
  const ticksEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = '行情 - DSA'; }, []);
  useEffect(() => { saveWatchlist(watchlist); }, [watchlist]);

  const addStock = useCallback((code: string, name?: string) => {
    setWatchlist((prev) => {
      if (prev.some((item) => item.code === code)) return prev;
      return [...prev, { code, name: name || code }];
    });
    setSelectedCode(code);
    setShowAddStock(false);
  }, []);

  const removeStock = useCallback((code: string) => {
    setWatchlist((prev) => prev.filter((item) => item.code !== code));
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = init(chartRef.current);
    if (!chart) return;
    chartInst.current = chart;

    chart.setStyles({
      grid: {
        show: true,
        horizontal: { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed' as const },
        vertical: { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed' as const },
      },
      candle: {
        priceMark: { last: { show: true } },
        bar: {
          upColor: '#ef4444', downColor: '#22c55e',
          upBorderColor: '#ef4444', downBorderColor: '#22c55e',
          upWickColor: '#ef4444', downWickColor: '#22c55e',
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

    chart.setDataLoader({
      getBars: async (params) => {
        const { code, period } = fetchRef.current;
        try {
          setChartLoading(true);
          setChartError(null);
          const resp = await stocksApi.getHistory(code, period, 120);
          if (!resp.data.length) {
            setChartError('暂无K线数据');
            params.callback([], { backward: false, forward: false });
            return;
          }
          const klineData = resp.data.map((item) => ({
            timestamp: new Date(item.date).getTime(),
            open: item.open, high: item.high, low: item.low, close: item.close,
            volume: item.volume ?? undefined,
          }));
          params.callback(klineData, { backward: false, forward: false });
        } catch {
          setChartError('图表数据加载失败');
          params.callback([], { backward: false, forward: false });
        } finally {
          setChartLoading(false);
        }
      },
    });

    chart.setSymbol({ ticker: selectedCode });
    chart.setPeriod(PERIOD_MAP[activePeriod]);

    const onResize = () => { chart.resize(); };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (chartRef.current) { dispose(chartRef.current); }
      chartInst.current = null;
    };
  }, []);

  useEffect(() => {
    fetchRef.current = { code: selectedCode, period: activePeriod };
    if (chartInst.current) {
      chartInst.current.setSymbol({ ticker: selectedCode });
      chartInst.current.setPeriod(PERIOD_MAP[activePeriod]);
    }
  }, [selectedCode, activePeriod]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setQuoteLoading(true);
      try { const q = await stocksApi.getQuote(selectedCode); if (active) setQuote(q); }
      catch { if (active) setQuote(null); }
      finally { if (active) setQuoteLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [selectedCode]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const ob = await stocksApi.getOrderbook(selectedCode); if (active) setOrderbook(ob); }
      catch { if (active) setOrderbook(null); }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { active = false; clearInterval(t); };
  }, [selectedCode]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const td = await stocksApi.getTradeTicks(selectedCode, 60); if (active) setTicksData(td); }
      catch { if (active) setTicksData(null); }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { active = false; clearInterval(t); };
  }, [selectedCode]);

  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      const map: Record<string, StockQuote> = {};
      await Promise.allSettled(watchlist.map(async (item) => {
        try { const q = await stocksApi.getQuote(item.code); map[item.code] = q; } catch { /* skip */ }
      }));
      if (active) setQuotesMap(map);
    };
    loadAll();
    const t = setInterval(loadAll, 30000);
    return () => { active = false; clearInterval(t); };
  }, [watchlist]);

  useEffect(() => {
    if (!activeIndicator) { setIndicatorOutputs(null); return; }
    let active = true;
    const load = async () => {
      setIndicatorLoading(true);
      try {
        const resp = await formulaApi.runIndicator(activeIndicator, selectedCode, activePeriod, 120);
        if (active) setIndicatorOutputs(resp.outputs);
      } catch { if (active) setIndicatorOutputs(null); }
      finally { if (active) setIndicatorLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [activeIndicator, selectedCode, activePeriod]);

  useEffect(() => {
    if (ticksData && ticksEndRef.current) {
      ticksEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ticksData]);

  const handleAutocompleteSubmit = useCallback((code: string, name?: string, _source?: string) => {
    addStock(toPureCode(code), name);
    setSearchValue('');
  }, [addStock]);

  const handleSidebarSearchSubmit = useCallback((code: string, name?: string, _source?: string) => {
    addStock(toPureCode(code), name);
    setSidebarSearchValue('');
  }, [addStock]);

  const changeCls = useMemo(() => {
    if (!quote?.changePercent) return 'text-secondary-text';
    return quote.changePercent > 0 ? 'text-red-500' : quote.changePercent < 0 ? 'text-green-500' : 'text-secondary-text';
  }, [quote]);

  const refPrice = orderbook?.preClose || quote?.prevClose || 0;

  const maxVol = useMemo(() => {
    if (!orderbook) return 1;
    return Math.max(...orderbook.asks.map(a => a.volume), ...orderbook.bids.map(b => b.volume), 1);
  }, [orderbook]);

  return (
    <div className="h-[calc(100vh-24px)] sm:h-[calc(100vh-32px)] lg:h-[calc(100vh-32px)] flex flex-col overflow-hidden">

      {/* ====== 顶栏：股票信息 + 搜索 ====== */}
      <div className="shrink-0 border-b border-border/40 bg-card/30 px-4 py-2">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="text-sm font-bold text-foreground shrink-0">
              {quote?.stockName || selectedCode}
            </span>
            <span className="text-[11px] text-muted-text font-mono shrink-0">{selectedCode}</span>
            {quoteLoading ? <Spinner size={3} /> : quote ? (
              <>
                <span className={`text-lg font-bold font-mono ${changeCls} shrink-0`}>
                  {fmtP(quote.currentPrice)}
                </span>
                {quote.change != null && (
                  <span className={`text-xs font-mono ${changeCls} shrink-0`}>
                    {quote.change > 0 ? '+' : ''}{quote.change.toFixed(2)}
                  </span>
                )}
                {quote.changePercent != null && (
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${
                    quote.changePercent > 0 ? 'bg-red-500/15 text-red-500' :
                    quote.changePercent < 0 ? 'bg-green-500/15 text-green-500' :
                    'bg-foreground/5 text-secondary-text'
                  }`}>
                    {quote.changePercent > 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                  </span>
                )}
                <div className="hidden md:flex gap-x-3 text-[11px]">
                  <span><span className="text-muted-text">开</span> <span className="font-mono">{fmtP(quote.open)}</span></span>
                  <span><span className="text-muted-text">高</span> <span className="font-mono text-red-500">{fmtP(quote.high)}</span></span>
                  <span><span className="text-muted-text">低</span> <span className="font-mono text-green-500">{fmtP(quote.low)}</span></span>
                  <span><span className="text-muted-text">昨收</span> <span className="font-mono">{fmtP(quote.prevClose)}</span></span>
                  <span><span className="text-muted-text">量</span> <span className="font-mono">{fmtVol(quote.volume)}</span></span>
                  <span><span className="text-muted-text">额</span> <span className="font-mono">{fmtAmt(quote.amount)}</span></span>
                </div>
              </>
            ) : <span className="text-xs text-muted-text">暂无行情</span>}
          </div>
          <div className="w-56 shrink-0">
            <StockAutocomplete
              value={searchValue}
              onChange={setSearchValue}
              onSubmit={handleAutocompleteSubmit}
              placeholder="搜索股票，回车添加自选"
              className="!h-8 !text-xs !px-3"
            />
          </div>
        </div>
      </div>

      {/* ====== 主体三栏 ====== */}
      <div className="flex-1 min-h-0 flex">

        {/* ── 左栏：自选股 ── */}
        <aside className="w-[200px] shrink-0 border-r border-border/30 flex flex-col">
          <div className="px-3 py-1.5 border-b border-border/20 flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">自选股</span>
            <button
              onClick={() => setShowAddStock(!showAddStock)}
              className="text-[11px] text-primary hover:text-primary/80"
            >
              {showAddStock ? '收起' : '+ 添加'}
            </button>
          </div>
          {showAddStock && (
            <div className="px-2 py-1.5 border-b border-border/20">
              <StockAutocomplete
                value={sidebarSearchValue}
                onChange={setSidebarSearchValue}
                onSubmit={handleSidebarSearchSubmit}
                placeholder="输入代码或名称搜索"
                className="!h-7 !text-[11px] !px-2 !rounded"
              />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {watchlist.map((item) => {
              const q = quotesMap[item.code];
              const isActive = selectedCode === item.code;
              const pct = q?.changePercent;
              const cls = pct != null
                ? pct > 0 ? 'text-red-500' : pct < 0 ? 'text-green-500' : 'text-secondary-text'
                : 'text-secondary-text';
              return (
                <div
                  key={item.code}
                  className={`flex items-center group cursor-pointer ${isActive ? 'bg-primary/10' : 'hover:bg-foreground/5'}`}
                  onClick={() => setSelectedCode(item.code)}
                >
                  <div className={`w-[3px] self-stretch shrink-0 ${isActive ? 'bg-primary' : 'bg-transparent'}`} />
                  <div className="flex-1 flex items-center justify-between px-3 py-[7px] min-w-0">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground leading-tight">{item.name || item.code}</p>
                      <p className="text-[10px] text-muted-text font-mono">{item.code}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      {q ? (
                        <>
                          <p className={`text-xs font-mono font-medium ${cls} leading-tight`}>{fmtP(q.currentPrice)}</p>
                          <p className={`text-[10px] font-mono ${cls}`}>
                            {pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : '--'}
                          </p>
                        </>
                      ) : <p className="text-[10px] text-muted-text">--</p>}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeStock(item.code); }}
                    className="px-1 text-muted-text hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] shrink-0"
                  >✕</button>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── 中栏：K线 ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* 周期 + 指标标签 */}
          <div className="shrink-0 px-3 py-1 border-b border-border/20 flex items-center gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setActivePeriod(p.value)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  activePeriod === p.value
                    ? 'bg-primary/20 text-primary font-medium'
                    : 'text-secondary-text hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                {p.label}
              </button>
            ))}
            <span className="w-px h-4 bg-border/30 mx-2" />
            {INDICATOR_LIST.map((ind) => (
              <button
                key={ind.key}
                onClick={() => setActiveIndicator(activeIndicator === ind.key ? null : ind.key)}
                className={`px-2 py-1 text-[11px] rounded transition-colors flex items-center gap-1 ${
                  activeIndicator === ind.key
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-secondary-text hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ind.color }} />
                {ind.display}
              </button>
            ))}
          </div>

          {/* K线图 */}
          <div className="flex-1 min-h-0 relative">
            {chartLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-card/60">
                <div className="flex items-center gap-2 text-secondary-text">
                  <Spinner size={4} />
                  <span className="text-xs">加载中...</span>
                </div>
              </div>
            )}
            {chartError && !chartLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <span className="text-xs text-muted-text">{chartError}</span>
              </div>
            )}
            <div ref={chartRef} className="w-full h-full" />
          </div>

          {/* 指标结果条 */}
          {activeIndicator && indicatorOutputs && !indicatorLoading && (
            <div className="shrink-0 px-3 py-1.5 border-t border-border/30 bg-card/20">
              <div className="flex items-center gap-4 flex-wrap">
                {Object.entries(indicatorOutputs).map(([key, values]) => {
                  const last = values.length > 0 ? values[values.length - 1] : null;
                  const prev = values.length > 1 ? values[values.length - 2] : null;
                  const trend = last != null && prev != null
                    ? last > prev ? '↑' : last < prev ? '↓' : '→' : '';
                  const tc = trend === '↑' ? 'text-red-500' : trend === '↓' ? 'text-green-500' : 'text-secondary-text';
                  return (
                    <div key={key} className="flex items-center gap-1">
                      <span className="text-[11px] text-muted-text">{key}</span>
                      <span className="text-xs font-mono font-medium text-foreground">
                        {last != null ? last.toFixed(2) : '--'}
                      </span>
                      <span className={`text-[10px] font-mono ${tc}`}>{trend}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activeIndicator && indicatorLoading && (
            <div className="shrink-0 px-3 py-1.5 border-t border-border/30 bg-card/20 flex items-center gap-2">
              <Spinner size={3} />
              <span className="text-[11px] text-muted-text">计算中...</span>
            </div>
          )}
        </main>

        {/* ── 右栏：盘口 + 成交 ── */}
        <aside className="w-[260px] shrink-0 border-l border-border/30 flex flex-col">
          {/* 五档盘口 */}
          <div className="shrink-0 border-b border-border/30">
            <div className="px-3 py-1.5 border-b border-border/20">
              <span className="text-xs font-medium text-foreground">五档盘口</span>
            </div>
            {orderbook ? (
              <div className="px-3 py-1">
                <div className="space-y-px">
                  {[...orderbook.asks].reverse().map((level, i) => {
                    const label = `卖${5 - i}`;
                    const bw = Math.min((level.volume / maxVol) * 100, 100);
                    return (
                      <div key={`a${4 - i}`} className="flex items-center text-[11px] h-[20px] relative">
                        <div className="absolute right-0 top-0 bottom-0 bg-green-500/8 rounded-sm" style={{ width: `${bw}%` }} />
                        <span className="w-7 text-muted-text relative z-[1]">{label}</span>
                        <span className={`flex-1 font-mono ${pColor(level.price, refPrice)} relative z-[1]`}>{level.price.toFixed(2)}</span>
                        <span className="w-14 text-right font-mono text-foreground relative z-[1]">{fmtHand(level.volume)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center py-1 border-y border-border/15 my-0.5">
                  <span className={`text-sm font-bold font-mono ${changeCls}`}>{orderbook.price.toFixed(2)}</span>
                </div>
                <div className="space-y-px">
                  {orderbook.bids.map((level, i) => {
                    const label = `买${i + 1}`;
                    const bw = Math.min((level.volume / maxVol) * 100, 100);
                    return (
                      <div key={`b${i}`} className="flex items-center text-[11px] h-[20px] relative">
                        <div className="absolute right-0 top-0 bottom-0 bg-red-500/8 rounded-sm" style={{ width: `${bw}%` }} />
                        <span className="w-7 text-muted-text relative z-[1]">{label}</span>
                        <span className={`flex-1 font-mono ${pColor(level.price, refPrice)} relative z-[1]`}>{level.price.toFixed(2)}</span>
                        <span className="w-14 text-right font-mono text-foreground relative z-[1]">{fmtHand(level.volume)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="px-3 py-3 text-center text-[11px] text-muted-text">暂无盘口数据</div>
            )}
          </div>

          {/* 成交明细 */}
          <div className="flex-1 min-h-0 flex flex-col border-b border-border/30">
            <div className="shrink-0 px-3 py-1.5 border-b border-border/20">
              <span className="text-xs font-medium text-foreground">成交明细</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {ticksData && ticksData.ticks.length > 0 ? (
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-muted-text sticky top-0 bg-card">
                      <th className="text-left font-normal px-2 py-0.5">时间</th>
                      <th className="text-right font-normal px-2 py-0.5">价格</th>
                      <th className="text-right font-normal px-2 py-0.5">量</th>
                      <th className="text-center font-normal px-2 py-0.5">方向</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticksData.ticks.map((tick, i) => {
                      const dir = tick.type === 0 ? '买' : tick.type === 1 ? '卖' : '中';
                      const dc = tick.type === 0 ? 'text-red-500' : tick.type === 1 ? 'text-green-500' : 'text-muted-text';
                      const pc = refPrice > 0 ? pColor(tick.price, refPrice) : 'text-foreground';
                      return (
                        <tr key={i} className="hover:bg-foreground/5">
                          <td className="px-2 py-px font-mono text-muted-text">{tick.time}</td>
                          <td className={`px-2 py-px font-mono text-right ${pc}`}>{tick.price.toFixed(2)}</td>
                          <td className="px-2 py-px font-mono text-right text-foreground">{tick.volume}</td>
                          <td className={`px-2 py-px text-center ${dc}`}>{dir}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="px-3 py-3 text-center text-[11px] text-muted-text">暂无成交数据</div>
              )}
              <div ref={ticksEndRef} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default MarketPage;
