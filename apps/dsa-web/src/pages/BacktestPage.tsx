import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Check, Minus, X } from 'lucide-react';
import { backtestApi } from '../api/backtest';
import type { ParsedApiError } from '../api/error';
import { getParsedApiError } from '../api/error';
import { ApiErrorAlert, Card, Badge, EmptyState, Pagination, StatusDot, Tooltip } from '../components/common';
import type {
  BacktestResultItem,
  BacktestRunResponse,
  PerformanceMetrics,
} from '../types/backtest';

const BACKTEST_INPUT_CLASS =
  'input-surface input-focus-glow h-8 w-full rounded-sm border bg-transparent px-3 text-xs font-mono transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';
const BACKTEST_COMPACT_INPUT_CLASS =
  'input-surface input-focus-glow h-7 rounded-sm border bg-transparent px-2 py-1 text-[11px] font-mono transition-all focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

// ============ Helpers ============

function pct(value?: number | null): string {
  if (value == null) return '--';
  return `${value.toFixed(1)}%`;
}

function outcomeBadge(outcome?: string) {
  if (!outcome) return <Badge variant="default">--</Badge>;
  switch (outcome) {
    case 'win':
      return <Badge variant="success">WIN</Badge>;
    case 'loss':
      return <Badge variant="danger">LOSS</Badge>;
    case 'neutral':
      return <Badge variant="warning">NEUTRAL</Badge>;
    default:
      return <Badge variant="default">{outcome}</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="success">完成</Badge>;
    case 'insufficient':
    case 'insufficient_data':
      return <Badge variant="warning">不足</Badge>;
    case 'error':
      return <Badge variant="danger">错误</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}

function actualMovementBadge(movement?: string | null) {
  switch (movement) {
    case 'up':
      return <Badge variant="success">涨</Badge>;
    case 'down':
      return <Badge variant="danger">跌</Badge>;
    case 'flat':
      return <Badge variant="warning">平</Badge>;
    default:
      return <Badge variant="default">--</Badge>;
  }
}

function boolIcon(value?: boolean | null) {
  if (value === true) {
    return (
      <span
        className="backtest-status-chip backtest-status-chip-success"
        aria-label="yes"
      >
        <StatusDot tone="success" className="backtest-status-chip-dot" />
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (value === false) {
    return (
      <span
        className="backtest-status-chip backtest-status-chip-danger"
        aria-label="no"
      >
        <StatusDot tone="danger" className="backtest-status-chip-dot" />
        <X className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span
      className="backtest-status-chip backtest-status-chip-neutral"
      aria-label="unknown"
    >
      <StatusDot tone="neutral" className="backtest-status-chip-dot" />
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

// ============ Metric Row ============

const MetricRow: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="backtest-metric-row">
    <span className="label">{label}</span>
    <span className={`value ${accent ? 'accent' : ''}`}>{value}</span>
  </div>
);

// ============ Performance Card ============

const PerformanceCard: React.FC<{ metrics: PerformanceMetrics; title: string }> = ({ metrics, title }) => (
  <Card variant="bordered" padding="sm" className="animate-fade-in">
    <div className="mb-2">
      <span className="label-uppercase">{title}</span>
    </div>
    <MetricRow label="方向准确率" value={pct(metrics.directionAccuracyPct)} accent />
    <MetricRow label="胜率" value={pct(metrics.winRatePct)} accent />
    <MetricRow label="平均模拟收益" value={pct(metrics.avgSimulatedReturnPct)} />
    <MetricRow label="平均股票收益" value={pct(metrics.avgStockReturnPct)} />
    <MetricRow label="止损触发率" value={pct(metrics.stopLossTriggerRate)} />
    <MetricRow label="止盈触发率" value={pct(metrics.takeProfitTriggerRate)} />
    <MetricRow label="平均命中天数" value={metrics.avgDaysToFirstHit != null ? metrics.avgDaysToFirstHit.toFixed(1) : '--'} />
    <div className="backtest-metric-footer">
      <span className="text-[11px] text-muted-text">评估次数</span>
      <span className="text-[11px] text-secondary-text font-mono">
        {Number(metrics.completedCount)} / {Number(metrics.totalEvaluations)}
      </span>
    </div>
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-text">W / L / N</span>
      <span className="text-[11px] font-mono">
        <span className="text-emerald-400">{metrics.winCount}</span>
        {' / '}
        <span className="text-red-400">{metrics.lossCount}</span>
        {' / '}
        <span className="text-amber-400">{metrics.neutralCount}</span>
      </span>
    </div>
  </Card>
);

// ============ Run Summary ============

const RunSummary: React.FC<{ data: BacktestRunResponse }> = ({ data }) => (
  <div className="backtest-summary animate-fade-in">
    <span className="label">已处理: <span className="value">{data.processed}</span></span>
    <span className="label">已保存: <span className="value primary">{data.saved}</span></span>
    <span className="label">已完成: <span className="value success">{data.completed}</span></span>
    <span className="label">数据不足: <span className="value warning">{data.insufficient}</span></span>
    {data.errors > 0 && (
      <span className="label">错误: <span className="value danger">{data.errors}</span></span>
    )}
  </div>
);

// ============ Main Page ============

const BacktestPage: React.FC = () => {
  // Set page title
  useEffect(() => {
    document.title = '策略回测 - 牛气';
  }, []);

  // Input state
  const [codeFilter, setCodeFilter] = useState('');
  const [analysisDateFrom, setAnalysisDateFrom] = useState('');
  const [analysisDateTo, setAnalysisDateTo] = useState('');
  const [evalDays, setEvalDays] = useState('');
  const [forceRerun, setForceRerun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<BacktestRunResponse | null>(null);
  const [runError, setRunError] = useState<ParsedApiError | null>(null);
  const [pageError, setPageError] = useState<ParsedApiError | null>(null);

  // Results state
  const [results, setResults] = useState<BacktestResultItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const pageSize = 20;

  // Performance state
  const [overallPerf, setOverallPerf] = useState<PerformanceMetrics | null>(null);
  const [stockPerf, setStockPerf] = useState<PerformanceMetrics | null>(null);
  const [isLoadingPerf, setIsLoadingPerf] = useState(false);
  const effectiveWindowDays = evalDays ? parseInt(evalDays, 10) : overallPerf?.evalWindowDays;
  const isNextDayValidation = effectiveWindowDays === 1;
  const showNextDayActualColumns = isNextDayValidation;

  // Fetch results
  const fetchResults = useCallback(async (
    page = 1,
    code?: string,
    windowDays?: number,
    startDate?: string,
    endDate?: string,
  ) => {
    setIsLoadingResults(true);
    try {
      const response = await backtestApi.getResults({
        code: code || undefined,
        evalWindowDays: windowDays,
        analysisDateFrom: startDate || undefined,
        analysisDateTo: endDate || undefined,
        page,
        limit: pageSize,
      });
      setResults(response.items);
      setTotalResults(response.total);
      setCurrentPage(response.page);
      setPageError(null);
    } catch (err) {
      console.error('Failed to fetch backtest results:', err);
      setPageError(getParsedApiError(err));
    } finally {
      setIsLoadingResults(false);
    }
  }, []);

  // Fetch performance
  const fetchPerformance = useCallback(async (
    code?: string,
    windowDays?: number,
    startDate?: string,
    endDate?: string,
  ) => {
    setIsLoadingPerf(true);
    try {
      const overall = await backtestApi.getOverallPerformance({
        evalWindowDays: windowDays,
        analysisDateFrom: startDate || undefined,
        analysisDateTo: endDate || undefined,
      });
      setOverallPerf(overall);

      if (code) {
        const stock = await backtestApi.getStockPerformance(code, {
          evalWindowDays: windowDays,
          analysisDateFrom: startDate || undefined,
          analysisDateTo: endDate || undefined,
        });
        setStockPerf(stock);
      } else {
        setStockPerf(null);
      }
      setPageError(null);
    } catch (err) {
      console.error('Failed to fetch performance:', err);
      setPageError(getParsedApiError(err));
    } finally {
      setIsLoadingPerf(false);
    }
  }, []);

  // Initial load — fetch performance first, then filter results by its window
  useEffect(() => {
    const init = async () => {
      // Get latest performance (unfiltered returns most recent summary)
      const overall = await backtestApi.getOverallPerformance();
      setOverallPerf(overall);
      // Use the summary's eval_window_days to filter results consistently
      const windowDays = overall?.evalWindowDays;
      if (windowDays && !evalDays) {
        setEvalDays(String(windowDays));
      }
      fetchResults(1, undefined, windowDays, undefined, undefined);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Run backtest
  const handleRun = async () => {
    setIsRunning(true);
    setRunResult(null);
    setRunError(null);
    try {
      const code = codeFilter.trim() || undefined;
      const evalWindowDays = evalDays ? parseInt(evalDays, 10) : undefined;
      const response = await backtestApi.run({
        code,
        force: forceRerun || undefined,
        minAgeDays: forceRerun ? 0 : undefined,
        evalWindowDays,
      });
      setRunResult(response);
      // Refresh data with same eval_window_days
      fetchResults(1, codeFilter.trim() || undefined, evalWindowDays, analysisDateFrom, analysisDateTo);
      fetchPerformance(codeFilter.trim() || undefined, evalWindowDays, analysisDateFrom, analysisDateTo);
    } catch (err) {
      setRunError(getParsedApiError(err));
    } finally {
      setIsRunning(false);
    }
  };

  // Filter by code
  const handleFilter = () => {
    const code = codeFilter.trim() || undefined;
    const windowDays = evalDays ? parseInt(evalDays, 10) : undefined;
    setCurrentPage(1);
    fetchResults(1, code, windowDays, analysisDateFrom, analysisDateTo);
    fetchPerformance(code, windowDays, analysisDateFrom, analysisDateTo);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFilter();
    }
  };

  const handleShowNextDay = () => {
    const code = codeFilter.trim() || undefined;
    setEvalDays('1');
    setCurrentPage(1);
    fetchResults(1, code, 1, analysisDateFrom, analysisDateTo);
    fetchPerformance(code, 1, analysisDateFrom, analysisDateTo);
  };

  // Pagination
  const totalPages = Math.ceil(totalResults / pageSize);
  const handlePageChange = (page: number) => {
    const windowDays = evalDays ? parseInt(evalDays, 10) : undefined;
    fetchResults(page, codeFilter.trim() || undefined, windowDays, analysisDateFrom, analysisDateTo);
  };

  return (
    <div className="min-h-full flex flex-col bg-transparent">
      <header className="flex-shrink-0 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-[1_1_220px]">
            <input
              type="text"
              value={codeFilter}
              onChange={(e) => setCodeFilter(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="按股票代码筛选（留空查全部）"
              disabled={isRunning}
              className={BACKTEST_INPUT_CLASS}
            />
          </div>
          <button
            type="button"
            onClick={handleFilter}
            disabled={isLoadingResults}
            className="btn-secondary flex items-center gap-1.5 whitespace-nowrap"
          >
            Filter
          </button>
          <div className="flex items-center gap-2 whitespace-nowrap lg:w-40 lg:justify-between">
            <span className="text-xs text-muted-text">窗口</span>
            <input
              type="number"
              min={1}
              max={120}
              value={evalDays}
              onChange={(e) => setEvalDays(e.target.value)}
              placeholder="10"
              disabled={isRunning}
              className={`${BACKTEST_COMPACT_INPUT_CLASS} w-24 text-center tabular-nums`}
            />
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-xs text-muted-text">起始</span>
            <input
              type="date"
              aria-label="Analysis date from"
              value={analysisDateFrom}
              onChange={(e) => setAnalysisDateFrom(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
              className={`${BACKTEST_COMPACT_INPUT_CLASS} w-40 text-center tabular-nums`}
            />
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-xs text-muted-text">截止</span>
            <input
              type="date"
              aria-label="Analysis date to"
              value={analysisDateTo}
              onChange={(e) => setAnalysisDateTo(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
              className={`${BACKTEST_COMPACT_INPUT_CLASS} w-40 text-center tabular-nums`}
            />
          </div>
          <button
            type="button"
            onClick={handleShowNextDay}
            disabled={isLoadingResults || isLoadingPerf}
            className={`backtest-force-btn ${isNextDayValidation ? 'active' : ''}`}
          >
            <span className="dot" />
            1D Validation
          </button>
          <button
            type="button"
            onClick={() => setForceRerun(!forceRerun)}
            disabled={isRunning}
            className={`backtest-force-btn ${forceRerun ? 'active' : ''}`}
          >
            <span className="dot" />
            Force
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning}
            className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
          >
            {isRunning ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Running...
              </>
            ) : (
              '运行回测'
            )}
          </button>
        </div>
        {runResult && (
          <div className="mt-1.5">
            <RunSummary data={runResult} />
          </div>
        )}
        {runError && (
          <ApiErrorAlert error={runError} className="mt-1.5" />
        )}
        <p className="mt-1.5 text-[11px] text-muted-text">
          {isNextDayValidation
            ? 'Next-day validation mode compares AI predictions with the next trading day close.'
            : 'Use window = 1 to review AI predictions against the next trading day close.'}
        </p>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 lg:flex-row">
        <div className="flex max-h-[38vh] flex-col gap-2 overflow-y-auto lg:max-h-none lg:w-52 lg:flex-shrink-0">
          {isLoadingPerf ? (
            <div className="flex items-center justify-center py-8">
              <div className="backtest-spinner sm" />
            </div>
          ) : overallPerf ? (
            <PerformanceCard metrics={overallPerf} title="Overall Performance" />
          ) : (
            <EmptyState
              title="No Metrics Yet"
              description="Run a backtest to generate portfolio-level performance metrics."
              className="h-full min-h-[10rem] border-dashed border-border bg-card/45 shadow-none"
            />
          )}

          {stockPerf && (
            <PerformanceCard metrics={stockPerf} title={`${stockPerf.code || codeFilter}`} />
          )}
        </div>

        <section className="min-h-0 flex-1 overflow-y-auto">
          {pageError ? (
            <ApiErrorAlert error={pageError} className="mb-2" />
          ) : null}
          {isLoadingResults ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="backtest-spinner md" />
              <p className="mt-3 text-secondary-text text-sm">Loading results...</p>
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              title="No Results"
              description="Run a backtest to evaluate historical analysis accuracy"
              className="backtest-empty-state border-dashed"
              icon={(
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )}
            />
          ) : (
            <div className="animate-fade-in">
              <div className="backtest-table-toolbar">
                <div className="backtest-table-toolbar-meta">
                  <span className="label-uppercase">{isNextDayValidation ? '次日验证' : '结果集'}</span>
                  <span className="text-[11px] text-secondary-text">
                    {codeFilter.trim() ? `筛选: ${codeFilter.trim()}` : '全部股票'}
                    {evalDays ? ` · ${evalDays}天窗口` : ''}
                    {analysisDateFrom ? ` · 从${analysisDateFrom}` : ''}
                    {analysisDateTo ? ` · 至${analysisDateTo}` : ''}
                  </span>
                </div>
                <span className="backtest-table-scroll-hint text-[11px]">小屏幕可横向滚动</span>
              </div>
              <div className="backtest-table-wrapper">
                <table className="backtest-table min-w-[840px] w-full text-xs">
                  <thead className="backtest-table-head">
                    <tr className="text-left">
                      <th className="backtest-table-head-cell">股票</th>
                      <th className="backtest-table-head-cell">分析日期</th>
                      <th className="backtest-table-head-cell">AI预测</th>
                      <th className="backtest-table-head-cell">
                        {showNextDayActualColumns ? '实际' : '区间收益'}
                      </th>
                      <th className="backtest-table-head-cell">
                        {showNextDayActualColumns ? '准确率' : '方向匹配'}
                      </th>
                      <th className="backtest-table-head-cell">结果</th>
                      <th className="backtest-table-head-cell">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr
                        key={row.analysisHistoryId}
                        className="backtest-table-row"
                      >
                        <td className="backtest-table-cell backtest-table-code">
                          <div className="flex flex-col">
                            <span className="font-mono">{row.code}</span>
                            <span className="text-[11px] text-muted-text">{row.stockName || '--'}</span>
                          </div>
                        </td>
                        <td className="backtest-table-cell text-secondary-text font-mono">{row.analysisDate || '--'}</td>
                        <td className="backtest-table-cell max-w-[220px] text-foreground">
                          {(row.trendPrediction || row.operationAdvice) ? (
                            <Tooltip
                              content={[row.trendPrediction, row.operationAdvice].filter(Boolean).join(' / ')}
                              focusable
                            >
                              <div className="flex flex-col gap-1">
                                <span className="block truncate">{row.trendPrediction || '--'}</span>
                                <span className="block truncate text-xs text-secondary-text">{row.operationAdvice || '--'}</span>
                              </div>
                            </Tooltip>
                          ) : (
                            '--'
                          )}
                        </td>
                        <td className="backtest-table-cell">
                          <div className="flex items-center gap-2">
                            {actualMovementBadge(row.actualMovement)}
                            <span className={
                              row.actualReturnPct != null
                                ? row.actualReturnPct > 0 ? 'text-emerald-400 font-mono' : row.actualReturnPct < 0 ? 'text-red-400 font-mono' : 'text-secondary-text font-mono'
                                : 'text-muted-text font-mono'
                            }>
                              {pct(row.actualReturnPct)}
                            </span>
                          </div>
                        </td>
                        <td className="backtest-table-cell">
                          <span className="flex items-center gap-2">
                            {boolIcon(row.directionCorrect)}
                            <span className="text-muted-text">{row.directionExpected || ''}</span>
                          </span>
                        </td>
                        <td className="backtest-table-cell">{outcomeBadge(row.outcome)}</td>
                        <td className="backtest-table-cell">{statusBadge(row.evalStatus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              </div>

              <p className="text-[11px] text-muted-text text-center mt-1 font-mono">
                {totalResults} result{totalResults !== 1 ? 's' : ''} total · page {currentPage} of {Math.max(totalPages, 1)}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default BacktestPage;
