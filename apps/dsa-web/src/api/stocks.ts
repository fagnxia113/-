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
