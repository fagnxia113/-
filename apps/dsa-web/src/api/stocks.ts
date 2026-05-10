import apiClient from './index';

export type ExtractItem = {
  code?: string | null;
  name?: string | null;
  confidence: string;
};

export type ExtractFromImageResponse = {
  codes: string[];
  items?: ExtractItem[];
  rawText?: string;
};

export type StockQuote = {
  stockCode: string;
  stockName?: string | null;
  currentPrice: number;
  change?: number | null;
  changePercent?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
  volume?: number | null;
  amount?: number | null;
  volumeRatio?: number | null;
  turnoverRate?: number | null;
  amplitude?: number | null;
  peRatio?: number | null;
  pbRatio?: number | null;
  totalMv?: number | null;
  circMv?: number | null;
  high52w?: number | null;
  low52w?: number | null;
  updateTime?: string | null;
};

export type KLineDataItem = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  amount?: number | null;
  changePercent?: number | null;
};

export type StockHistoryResponse = {
  stockCode: string;
  stockName?: string | null;
  period: string;
  data: KLineDataItem[];
};

export type OrderBookLevel = {
  price: number;
  volume: number;
};

export type OrderBookResponse = {
  code: string;
  name?: string | null;
  price: number;
  preClose: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
};

export type TradeTick = {
  time: string;
  price: number;
  volume: number;
  num: number;
  type: number;
};

export type TradeTicksResponse = {
  code: string;
  ticks: TradeTick[];
};

export type IndexQuote = {
  code: string;
  name: string;
  price: number;
  change?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  amount?: number | null;
  upCount?: number | null;
  downCount?: number | null;
};

export type FinanceInfo = {
  code: string;
  source: string;
  updatedDate: string;
  totalShares?: number | null;
  floatShares?: number | null;
  bps?: number | null;
  mainRevenue?: number | null;
  netProfit?: number | null;
  netAssets?: number | null;
  totalAssets?: number | null;
  operatingCashFlow?: number | null;
  shareholderCount?: number | null;
  peDynamic?: number | null;
  pbRatio?: number | null;
  roe?: number | null;
};

export type XdxrItem = {
  year?: number | null;
  month?: number | null;
  day?: number | null;
  category?: number | null;
  categoryName?: string | null;
  dividendPerShare?: number | null;
  bonusShareRatio?: number | null;
  rightsIssueRatio?: number | null;
  rightsIssuePrice?: number | null;
  totalSharesAfter?: number | null;
  floatSharesAfter?: number | null;
};

export type XdxrResponse = {
  code: string;
  records: XdxrItem[];
};

export type RpsData = {
  code: string;
  rps: number | null;
  periodReturn: number | null;
  rankDesc: string;
  periodDays: number;
};

export type DivergenceSignal = {
  type: string;
  name: string;
  direction: string;
  strength: string;
  description: string;
  date: string;
};

export type DivergenceData = {
  code: string;
  signals: DivergenceSignal[];
  bullCount: number;
  bearCount: number;
  summary: string;
};

export type ResonanceSignal = {
  name: string;
  direction: string;
  weight: number;
};

export type ResonanceData = {
  code: string;
  score: number;
  level: string;
  signals: ResonanceSignal[];
  bullCount: number;
  bearCount: number;
};

export type BacktestSummaryItem = {
  analysisDate: string | null;
  operationAdvice: string | null;
  directionCorrect: boolean | null;
  stockReturnPct: number | null;
  simulatedReturnPct: number | null;
};

export type BacktestSummaryData = {
  code: string;
  hasData: boolean;
  summary: {
    totalEvaluations: number;
    directionAccuracyPct: number | null;
    winRatePct: number | null;
    avgSimulatedReturnPct: number | null;
  } | null;
  recent: BacktestSummaryItem[];
};

export const stocksApi = {
  async extractFromImage(file: File): Promise<ExtractFromImageResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: { [key: string]: string | undefined } = { 'Content-Type': undefined };
    const response = await apiClient.post(
      '/api/v1/stocks/extract-from-image',
      formData,
      {
        headers,
        timeout: 60000,
      },
    );

    const data = response.data as { codes?: string[]; items?: ExtractItem[]; raw_text?: string };
    return {
      codes: data.codes ?? [],
      items: data.items,
      rawText: data.raw_text,
    };
  },

  async parseImport(file?: File, text?: string): Promise<ExtractFromImageResponse> {
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      const headers: { [key: string]: string | undefined } = { 'Content-Type': undefined };
      const response = await apiClient.post('/api/v1/stocks/parse-import', formData, { headers });
      const data = response.data as { codes?: string[]; items?: ExtractItem[] };
      return { codes: data.codes ?? [], items: data.items };
    }
    if (text) {
      const response = await apiClient.post('/api/v1/stocks/parse-import', { text });
      const data = response.data as { codes?: string[]; items?: ExtractItem[] };
      return { codes: data.codes ?? [], items: data.items };
    }
    throw new Error('请提供文件或粘贴文本');
  },

  async getQuote(stockCode: string): Promise<StockQuote> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/quote`);
    const d = response.data as Record<string, unknown>;
    return {
      stockCode: (d.stock_code ?? stockCode) as string,
      stockName: (d.stock_name ?? null) as string | null,
      currentPrice: (d.current_price ?? 0) as number,
      change: (d.change ?? null) as number | null,
      changePercent: (d.change_percent ?? null) as number | null,
      open: (d.open ?? null) as number | null,
      high: (d.high ?? null) as number | null,
      low: (d.low ?? null) as number | null,
      prevClose: (d.prev_close ?? null) as number | null,
      volume: (d.volume ?? null) as number | null,
      amount: (d.amount ?? null) as number | null,
      volumeRatio: (d.volume_ratio ?? null) as number | null,
      turnoverRate: (d.turnover_rate ?? null) as number | null,
      amplitude: (d.amplitude ?? null) as number | null,
      peRatio: (d.pe_ratio ?? null) as number | null,
      pbRatio: (d.pb_ratio ?? null) as number | null,
      totalMv: (d.total_mv ?? null) as number | null,
      circMv: (d.circ_mv ?? null) as number | null,
      high52w: (d.high_52w ?? null) as number | null,
      low52w: (d.low_52w ?? null) as number | null,
      updateTime: (d.update_time ?? null) as string | null,
    };
  },

  async getHistory(stockCode: string, period = 'daily', days = 120): Promise<StockHistoryResponse> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/history`, {
      params: { period, days },
    });
    const d = response.data as Record<string, unknown>;
    const rawData = (d.data ?? []) as Record<string, unknown>[];
    return {
      stockCode: (d.stock_code ?? stockCode) as string,
      stockName: (d.stock_name ?? null) as string | null,
      period: (d.period ?? period) as string,
      data: rawData.map((item) => ({
        date: item.date as string,
        open: item.open as number,
        high: item.high as number,
        low: item.low as number,
        close: item.close as number,
        volume: (item.volume ?? null) as number | null,
        amount: (item.amount ?? null) as number | null,
        changePercent: (item.change_percent ?? null) as number | null,
      })),
    };
  },

  async getOrderbook(stockCode: string): Promise<OrderBookResponse> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/orderbook`);
    const d = response.data as Record<string, unknown>;
    return {
      code: (d.code ?? stockCode) as string,
      name: (d.name ?? null) as string | null,
      price: (d.price ?? 0) as number,
      preClose: (d.pre_close ?? 0) as number,
      bids: ((d.bids ?? []) as { price: number; volume: number }[]),
      asks: ((d.asks ?? []) as { price: number; volume: number }[]),
    };
  },

  async getTradeTicks(stockCode: string, count = 50): Promise<TradeTicksResponse> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/ticks`, {
      params: { count },
    });
    const d = response.data as Record<string, unknown>;
    return {
      code: (d.code ?? stockCode) as string,
      ticks: ((d.ticks ?? []) as TradeTick[]),
    };
  },

  async getIndexQuotes(): Promise<IndexQuote[]> {
    const response = await apiClient.get('/api/v1/stocks/indices/quotes');
    const data = response.data as Record<string, unknown>[];
    return data.map((d) => ({
      code: d.code as string,
      name: (d.name ?? '') as string,
      price: (d.price ?? 0) as number,
      change: (d.change ?? null) as number | null,
      changePercent: (d.change_percent ?? null) as number | null,
      volume: (d.volume ?? null) as number | null,
      amount: (d.amount ?? null) as number | null,
      upCount: (d.up_count ?? null) as number | null,
      downCount: (d.down_count ?? null) as number | null,
    }));
  },

  async getFinanceInfo(stockCode: string): Promise<FinanceInfo> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/finance`);
    const d = response.data as Record<string, unknown>;
    return {
      code: (d.code ?? stockCode) as string,
      source: (d.source ?? '') as string,
      updatedDate: (d.updated_date ?? '') as string,
      totalShares: (d.total_shares ?? null) as number | null,
      floatShares: (d.float_shares ?? null) as number | null,
      bps: (d.bps ?? null) as number | null,
      mainRevenue: (d.main_revenue ?? null) as number | null,
      netProfit: (d.net_profit ?? null) as number | null,
      netAssets: (d.net_assets ?? null) as number | null,
      totalAssets: (d.total_assets ?? null) as number | null,
      operatingCashFlow: (d.operating_cash_flow ?? null) as number | null,
      shareholderCount: (d.shareholder_count ?? null) as number | null,
      peDynamic: (d.pe_dynamic ?? null) as number | null,
      pbRatio: (d.pb_ratio ?? null) as number | null,
      roe: (d.roe ?? null) as number | null,
    };
  },

  async getXdxrInfo(stockCode: string): Promise<XdxrResponse> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/xdxr`);
    const d = response.data as Record<string, unknown>;
    const rawRecords = (d.records ?? []) as Record<string, unknown>[];
    return {
      code: (d.code ?? stockCode) as string,
      records: rawRecords.map((r) => ({
        year: (r.year ?? null) as number | null,
        month: (r.month ?? null) as number | null,
        day: (r.day ?? null) as number | null,
        category: (r.category ?? null) as number | null,
        categoryName: (r.category_name ?? null) as string | null,
        dividendPerShare: (r.dividend_per_share ?? null) as number | null,
        bonusShareRatio: (r.bonus_share_ratio ?? null) as number | null,
        rightsIssueRatio: (r.rights_issue_ratio ?? null) as number | null,
        rightsIssuePrice: (r.rights_issue_price ?? null) as number | null,
        totalSharesAfter: (r.total_shares_after ?? null) as number | null,
        floatSharesAfter: (r.float_shares_after ?? null) as number | null,
      })),
    };
  },

  async getRps(stockCode: string, period = 60): Promise<RpsData> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/rps`, { params: { period } });
    const d = response.data as Record<string, unknown>;
    return {
      code: (d.code ?? stockCode) as string,
      rps: (d.rps ?? null) as number | null,
      periodReturn: (d.period_return ?? null) as number | null,
      rankDesc: (d.rank_desc ?? '') as string,
      periodDays: (d.period_days ?? 60) as number,
    };
  },

  async getDivergence(stockCode: string): Promise<DivergenceData> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/divergence`);
    const d = response.data as Record<string, unknown>;
    const rawSignals = (d.signals ?? []) as Record<string, unknown>[];
    return {
      code: (d.code ?? stockCode) as string,
      signals: rawSignals.map((s) => ({
        type: (s.type ?? '') as string,
        name: (s.name ?? '') as string,
        direction: (s.direction ?? '') as string,
        strength: (s.strength ?? 'medium') as string,
        description: (s.description ?? '') as string,
        date: (s.date ?? '') as string,
      })),
      bullCount: (d.bull_count ?? 0) as number,
      bearCount: (d.bear_count ?? 0) as number,
      summary: (d.summary ?? '') as string,
    };
  },

  async getResonance(stockCode: string): Promise<ResonanceData> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/resonance`);
    const d = response.data as Record<string, unknown>;
    const rawSignals = (d.signals ?? []) as Record<string, unknown>[];
    return {
      code: (d.code ?? stockCode) as string,
      score: (d.score ?? 0) as number,
      level: (d.level ?? '') as string,
      signals: rawSignals.map((s) => ({
        name: (s.name ?? '') as string,
        direction: (s.direction ?? '') as string,
        weight: (s.weight ?? 0) as number,
      })),
      bullCount: (d.bull_count ?? 0) as number,
      bearCount: (d.bear_count ?? 0) as number,
    };
  },

  async getBacktestSummary(stockCode: string): Promise<BacktestSummaryData> {
    const response = await apiClient.get(`/api/v1/stocks/${stockCode}/backtest-summary`);
    const d = response.data as Record<string, unknown>;
    const rawRecent = (d.recent ?? []) as Record<string, unknown>[];
    const rawSummary = d.summary as Record<string, unknown> | null;
    return {
      code: (d.code ?? stockCode) as string,
      hasData: (d.has_data ?? false) as boolean,
      summary: rawSummary ? {
        totalEvaluations: (rawSummary.total_evaluations ?? 0) as number,
        directionAccuracyPct: (rawSummary.direction_accuracy_pct ?? null) as number | null,
        winRatePct: (rawSummary.win_rate_pct ?? null) as number | null,
        avgSimulatedReturnPct: (rawSummary.avg_simulated_return_pct ?? null) as number | null,
      } : null,
      recent: rawRecent.map((r) => ({
        analysisDate: (r.analysis_date ?? null) as string | null,
        operationAdvice: (r.operation_advice ?? null) as string | null,
        directionCorrect: (r.direction_correct ?? null) as boolean | null,
        stockReturnPct: (r.stock_return_pct ?? null) as number | null,
        simulatedReturnPct: (r.simulated_return_pct ?? null) as number | null,
      })),
    };
  },
};

export type FormulaIndicatorInfo = {
  name: string;
  description: string;
};

export type FormulaEvaluateResponse = {
  stock_code: string;
  outputs: Record<string, (number | null)[]>;
};

export type FormulaIndicatorResponse = {
  stock_code: string;
  indicator: string;
  outputs: Record<string, (number | null)[]>;
};

export const formulaApi = {
  async getIndicators(): Promise<FormulaIndicatorInfo[]> {
    const response = await apiClient.get('/api/v1/formula/indicators');
    const d = response.data as { indicators?: { name: string; description: string }[] };
    return d.indicators ?? [];
  },

  async evaluateFormula(stockCode: string, formula: string, period = 'daily', days = 120): Promise<FormulaEvaluateResponse> {
    const response = await apiClient.post('/api/v1/formula/evaluate', {
      stock_code: stockCode,
      formula,
      period,
      days,
    });
    return response.data as FormulaEvaluateResponse;
  },

  async runIndicator(name: string, stockCode: string, period = 'daily', days = 120): Promise<FormulaIndicatorResponse> {
    const response = await apiClient.get(`/api/v1/formula/indicator/${name}`, {
      params: { stock_code: stockCode, period, days },
    });
    return response.data as FormulaIndicatorResponse;
  },
};
