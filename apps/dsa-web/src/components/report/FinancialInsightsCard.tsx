import type React from 'react';
import type { FinancialMetrics as FinancialMetricsType, SectorComparison as SectorComparisonType, ReportLanguage } from '../../types/analysis';
import { Card, StatCard } from '../common';
import { normalizeReportLanguage } from '../../utils/reportLanguage';

interface FinancialInsightsCardProps {
  financialMetrics?: FinancialMetricsType;
  sectorComparison?: SectorComparisonType;
  language?: ReportLanguage;
}

const coerceStr = (v: number | string | undefined | null): string => {
  if (v === undefined || v === null) return '—';
  return String(v);
};

const formatPct = (v: number | string | undefined | null): string => {
  if (v === undefined || v === null) return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
};

export const FinancialInsightsCard: React.FC<FinancialInsightsCardProps> = ({
  financialMetrics,
  sectorComparison,
  language = 'zh',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const isEn = reportLanguage === 'en';
  const hasFinancial = financialMetrics && Object.values(financialMetrics).some((v) => v !== undefined && v !== null);
  const hasSector = sectorComparison && Object.values(sectorComparison).some((v) => v !== undefined && v !== null);

  if (!hasFinancial && !hasSector) return null;

  return (
    <Card variant="bordered" padding="md" className="home-panel-card text-left">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-purple-500 to-indigo-500" />
        <h3 className="text-sm font-medium tracking-wide text-foreground">
          {isEn ? 'Fundamental & Sector' : '基本面与行业'}
        </h3>
      </div>

      {hasFinancial && (
        <div className="mb-5">
          <h4 className="text-xs uppercase tracking-[0.16em] text-secondary-text mb-3">
            {isEn ? 'Key Financial Metrics' : '核心财务指标'}
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label={isEn ? 'P/E' : '市盈率'}
              value={coerceStr(financialMetrics!.peRatio)}
              tone="primary"
            />
            <StatCard
              label={isEn ? 'P/B' : '市净率'}
              value={coerceStr(financialMetrics!.pbRatio)}
              tone="primary"
            />
            <StatCard
              label={isEn ? 'ROE' : '净资产收益率'}
              value={coerceStr(financialMetrics!.roe)}
              tone="success"
            />
            <StatCard
              label={isEn ? 'Debt Ratio' : '资产负债率'}
              value={coerceStr(financialMetrics!.debtRatio)}
              tone={(() => {
                const n = typeof financialMetrics!.debtRatio === 'number'
                  ? financialMetrics!.debtRatio
                  : Number(financialMetrics!.debtRatio);
                return Number.isFinite(n) && n > 60 ? 'danger' : 'default';
              })()}
            />
            <StatCard
              label={isEn ? 'Revenue Gr.' : '营收增速'}
              value={formatPct(financialMetrics!.revenueGrowth)}
              tone={(() => {
                const n = typeof financialMetrics!.revenueGrowth === 'number'
                  ? financialMetrics!.revenueGrowth
                  : Number(financialMetrics!.revenueGrowth);
                return Number.isFinite(n) && n > 0 ? 'success' : 'warning';
              })()}
            />
            <StatCard
              label={isEn ? 'Profit Gr.' : '利润增速'}
              value={formatPct(financialMetrics!.profitGrowth)}
              tone={(() => {
                const n = typeof financialMetrics!.profitGrowth === 'number'
                  ? financialMetrics!.profitGrowth
                  : Number(financialMetrics!.profitGrowth);
                return Number.isFinite(n) && n > 0 ? 'success' : 'warning';
              })()}
            />
            <StatCard
              label={isEn ? 'Div. Yield' : '股息率'}
              value={coerceStr(financialMetrics!.dividendYield)}
              tone="default"
            />
            <StatCard
              label={isEn ? 'Market Cap' : '市值'}
              value={coerceStr(financialMetrics!.marketCap)}
              tone="default"
            />
          </div>
        </div>
      )}

      {hasSector && (
        <div>
          <h4 className="text-xs uppercase tracking-[0.16em] text-secondary-text mb-3">
            {isEn ? 'Sector Comparison' : '行业对比'}
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              label={isEn ? 'Sector' : '所属行业'}
              value={coerceStr(sectorComparison!.sectorName)}
              tone="primary"
            />
            <StatCard
              label={isEn ? 'Sector Rank' : '行业排名'}
              value={coerceStr(sectorComparison!.sectorRank)}
              tone="primary"
            />
            <StatCard
              label={isEn ? 'Sector Trend' : '行业趋势'}
              value={coerceStr(sectorComparison!.sectorTrend)}
              tone="default"
            />
            <StatCard
              label={isEn ? 'Peer Avg P/E' : '同业平均PE'}
              value={coerceStr(sectorComparison!.peerAvgPe)}
              tone="default"
            />
            <StatCard
              label={isEn ? 'Rel. Strength' : '相对强度'}
              value={coerceStr(sectorComparison!.relativeStrength)}
              tone="default"
            />
            <StatCard
              label={isEn ? 'Sector Leader' : '行业龙头'}
              value={
                sectorComparison!.sectorLeading === true
                  ? (isEn ? 'Yes' : '是')
                  : sectorComparison!.sectorLeading === false
                    ? (isEn ? 'No' : '否')
                    : '—'
              }
              tone={sectorComparison!.sectorLeading ? 'success' : 'default'}
            />
          </div>
        </div>
      )}
    </Card>
  );
};
