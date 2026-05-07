import type React from 'react';
import type { RiskMetrics as RiskMetricsType, ReportLanguage } from '../../types/analysis';
import { Card, StatCard } from '../common';
import { normalizeReportLanguage } from '../../utils/reportLanguage';

interface RiskRewardCardProps {
  riskMetrics?: RiskMetricsType;
  language?: ReportLanguage;
}

const coerceNum = (v: number | string | undefined | null): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

export const RiskRewardCard: React.FC<RiskRewardCardProps> = ({
  riskMetrics,
  language = 'zh',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const isEn = reportLanguage === 'en';

  if (!riskMetrics) return null;

  const hasAny = Object.values(riskMetrics).some((v) => v !== undefined && v !== null);
  if (!hasAny) return null;

  const upside = coerceNum(riskMetrics.potentialUpsidePct);
  const downside = coerceNum(riskMetrics.potentialDownsidePct);
  const rrRatio = coerceNum(riskMetrics.riskRewardRatio);

  const getRewardTone = (val?: number): 'success' | 'warning' | 'danger' | 'default' => {
    if (val === undefined) return 'default';
    if (val >= 10) return 'success';
    if (val >= 5) return 'warning';
    return 'danger';
  };

  const getRiskTone = (val?: number): 'success' | 'warning' | 'danger' | 'default' => {
    if (val === undefined) return 'default';
    if (val <= 3) return 'success';
    if (val <= 7) return 'warning';
    return 'danger';
  };

  const getRatioTone = (val?: number): 'success' | 'warning' | 'danger' | 'default' => {
    if (val === undefined) return 'default';
    if (val >= 3) return 'success';
    if (val >= 1.5) return 'warning';
    return 'danger';
  };

  return (
    <Card variant="bordered" padding="md" className="home-panel-card text-left">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-500 to-red-500" />
        <h3 className="text-sm font-medium tracking-wide text-foreground">
          {isEn ? 'Risk-Reward Analysis' : '风险收益分析'}
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {upside !== undefined && (
          <StatCard
            label={isEn ? 'Potential Upside' : '潜在收益空间'}
            value={`${upside >= 0 ? '+' : ''}${upside.toFixed(2)}%`}
            tone={getRewardTone(upside)}
          />
        )}
        {downside !== undefined && (
          <StatCard
            label={isEn ? 'Potential Downside' : '潜在亏损空间'}
            value={`${downside >= 0 ? '-' : ''}${Math.abs(downside).toFixed(2)}%`}
            tone={getRiskTone(downside)}
          />
        )}
        {rrRatio !== undefined && (
          <StatCard
            label={isEn ? 'Risk-Reward Ratio' : '风险收益比'}
            value={`1:${rrRatio.toFixed(2)}`}
            tone={getRatioTone(rrRatio)}
            hint={
              rrRatio >= 3
                ? (isEn ? 'Favorable' : '收益风险比优秀')
                : rrRatio >= 1.5
                  ? (isEn ? 'Moderate' : '收益风险比适中')
                  : (isEn ? 'Unfavorable' : '收益风险比偏低')
            }
          />
        )}
        {coerceNum(riskMetrics.maxDrawdown) !== undefined && (
          <StatCard
            label={isEn ? 'Max Drawdown' : '最大回撤'}
            value={`${coerceNum(riskMetrics.maxDrawdown)!.toFixed(2)}%`}
            tone="danger"
          />
        )}
        {coerceNum(riskMetrics.volatility) !== undefined && (
          <StatCard
            label={isEn ? 'Volatility' : '波动率'}
            value={`${coerceNum(riskMetrics.volatility)!.toFixed(2)}%`}
            tone="warning"
          />
        )}
        {coerceNum(riskMetrics.sharpeRatio) !== undefined && (
          <StatCard
            label={isEn ? 'Sharpe Ratio' : '夏普比率'}
            value={coerceNum(riskMetrics.sharpeRatio)!.toFixed(2)}
            tone={coerceNum(riskMetrics.sharpeRatio)! >= 1 ? 'success' : 'default'}
          />
        )}
        {coerceNum(riskMetrics.beta) !== undefined && (
          <StatCard
            label={isEn ? 'Beta' : 'Beta系数'}
            value={coerceNum(riskMetrics.beta)!.toFixed(2)}
            tone={Math.abs(coerceNum(riskMetrics.beta)!) > 1.2 ? 'warning' : 'default'}
          />
        )}
      </div>

      {upside !== undefined && downside !== undefined && downside > 0 && (
        <div className="mt-4 pt-3 border-t border-subtle">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-secondary-text mb-1">
                <span>{isEn ? 'Downside' : '亏损'}</span>
                <span>{isEn ? 'Upside' : '收益'}</span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'hsl(var(--foreground) / 0.06)' }}>
                <div
                  className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-l-full transition-all duration-700"
                  style={{ width: `${(downside / (upside + downside)) * 100}%` }}
                />
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-r-full transition-all duration-700"
                  style={{ width: `${(upside / (upside + downside)) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-1">
                <span className="text-red-400">-{downside.toFixed(1)}%</span>
                <span className="text-emerald-400">+{upside.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
