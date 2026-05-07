import type React from 'react';
import type { HistoryComparison, ReportLanguage } from '../../types/analysis';
import { Card } from '../common';
import { normalizeReportLanguage } from '../../utils/reportLanguage';

interface HistoryComparisonCardProps {
  comparison: HistoryComparison;
  currentScore: number;
  currentAdvice?: string;
  language?: ReportLanguage;
}

const TREND_CONFIG = {
  improving: { icon: '📈', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
  declining: { icon: '📉', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  stable: { icon: '➡️', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/20' },
};

export const HistoryComparisonCard: React.FC<HistoryComparisonCardProps> = ({
  comparison,
  currentScore,
  currentAdvice,
  language = 'zh',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const isEn = reportLanguage === 'en';
  const trendConfig = TREND_CONFIG[comparison.trend];

  const formatScoreChange = (change: number): string => {
    if (change > 0) return `+${change}`;
    if (change < 0) return `${change}`;
    return '0';
  };

  const getTrendLabel = (trend: string): string => {
    if (isEn) {
      return trend === 'improving' ? 'Improving' : trend === 'declining' ? 'Declining' : 'Stable';
    }
    return trend === 'improving' ? '改善' : trend === 'declining' ? '恶化' : '持平';
  };

  const formatTime = (timeStr?: string): string => {
    if (!timeStr) return '—';
    try {
      const d = new Date(timeStr);
      if (Number.isNaN(d.getTime())) return timeStr;
      return d.toLocaleString(isEn ? 'en-US' : 'zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timeStr;
    }
  };

  return (
    <Card variant="bordered" padding="md" className="home-panel-card text-left">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-blue-500" />
        <h3 className="text-sm font-medium tracking-wide text-foreground">
          {isEn ? 'Historical Comparison' : '历史对比'}
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-lg border p-3 ${trendConfig.bgColor} ${trendConfig.borderColor}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{trendConfig.icon}</span>
            <span className={`text-xs font-semibold ${trendConfig.color}`}>
              {getTrendLabel(comparison.trend)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-foreground">
              {comparison.previousScore}
            </span>
            <span className="text-sm text-muted-text">→</span>
            <span className="text-2xl font-bold font-mono text-foreground">
              {currentScore}
            </span>
            <span className={`text-sm font-mono font-semibold ${trendConfig.color}`}>
              ({formatScoreChange(comparison.scoreChange)})
            </span>
          </div>
          <p className="text-xs text-secondary-text mt-1">
            {isEn ? 'Score change vs last analysis' : '相比上次分析的评分变化'}
          </p>
        </div>

        {comparison.adviceChanged && (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🔄</span>
              <span className="text-xs font-semibold text-yellow-400">
                {isEn ? 'Signal Changed' : '信号切换'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-card border border-subtle">
                {comparison.previousAdvice || '—'}
              </span>
              <span className="text-muted-text">→</span>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-card border border-subtle">
                {currentAdvice || '—'}
              </span>
            </div>
          </div>
        )}

        {comparison.previousTime && (
          <div className="rounded-lg border border-subtle p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">🕐</span>
              <span className="text-xs font-semibold text-secondary-text">
                {isEn ? 'Last Analysis' : '上次分析'}
              </span>
            </div>
            <p className="text-sm font-mono text-foreground">
              {formatTime(comparison.previousTime)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-subtle">
        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary-text">
            {isEn ? 'Score trend' : '评分走势'}
          </span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--foreground) / 0.06)' }}>
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                comparison.trend === 'improving'
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                  : comparison.trend === 'declining'
                    ? 'bg-gradient-to-r from-red-500 to-orange-400'
                    : 'bg-gradient-to-r from-yellow-500 to-amber-400'
              }`}
              style={{ width: `${Math.max(5, Math.min(100, currentScore))}%` }}
            />
          </div>
          <span className="text-xs font-mono text-foreground">{currentScore}</span>
        </div>
      </div>

      {comparison.backtest && (
        <div className="mt-4 pt-3 border-t border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🔬</span>
            <span className="text-xs font-semibold text-secondary-text uppercase tracking-[0.16em]">
              {isEn ? 'Backtest Verification' : '回测验证'}
            </span>
            <span className="text-xs text-muted-text">
              {isEn ? 'If you followed last advice' : '如果按上次建议操作'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-subtle p-2.5">
              <p className="text-xs text-secondary-text mb-1">{isEn ? 'Entry Price' : '建仓价'}</p>
              <p className="text-sm font-bold font-mono text-foreground">{comparison.backtest.entryPrice.toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-subtle p-2.5">
              <p className="text-xs text-secondary-text mb-1">{isEn ? 'Current Price' : '当前价'}</p>
              <p className="text-sm font-bold font-mono text-foreground">{comparison.backtest.currentPrice.toFixed(2)}</p>
            </div>
            <div className={`rounded-lg border p-2.5 ${comparison.backtest.pnlPct >= 0 ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-red-500/20 bg-red-500/10'}`}>
              <p className="text-xs text-secondary-text mb-1">{isEn ? 'P&L' : '盈亏'}</p>
              <p className={`text-sm font-bold font-mono ${comparison.backtest.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {comparison.backtest.pnlPct >= 0 ? '+' : ''}{comparison.backtest.pnlPct.toFixed(2)}%
              </p>
            </div>
            <div className={`rounded-lg border p-2.5 ${comparison.backtest.hitTakeProfit ? 'border-emerald-500/20 bg-emerald-500/10' : comparison.backtest.hitStopLoss ? 'border-red-500/20 bg-red-500/10' : 'border-subtle'}`}>
              <p className="text-xs text-secondary-text mb-1">{isEn ? 'Status' : '状态'}</p>
              <p className={`text-sm font-bold ${comparison.backtest.hitTakeProfit ? 'text-emerald-400' : comparison.backtest.hitStopLoss ? 'text-red-400' : 'text-foreground'}`}>
                {comparison.backtest.hitTakeProfit
                  ? (isEn ? '🎯 Hit Target' : '🎯 已达目标')
                  : comparison.backtest.hitStopLoss
                    ? (isEn ? '🛑 Hit Stop' : '🛑 已触止损')
                    : (isEn ? '⏳ Holding' : '⏳ 持仓中')}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
