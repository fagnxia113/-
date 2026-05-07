import React from 'react';
import type { AnalysisResult, AnalysisReport } from '../../types/analysis';
import { ReportOverview } from './ReportOverview';
import { ReportStrategy } from './ReportStrategy';
import { ReportNews } from './ReportNews';
import { ReportDetails } from './ReportDetails';
import { FactorScoreCard } from './FactorScoreCard';
import { FactorRadarChart } from './FactorRadarChart';
import { FinancialInsightsCard } from './FinancialInsightsCard';
import { RiskRewardCard } from './RiskRewardCard';
import { HistoryComparisonCard } from './HistoryComparisonCard';
import { KlineChartView } from './KlineChartView';
import { DebateConsensusPanel } from './DebateConsensusPanel';
import { TradingPlanPanel } from './TradingPlanPanel';
import { getReportText, normalizeReportLanguage } from '../../utils/reportLanguage';

interface ReportSummaryProps {
  data: AnalysisResult | AnalysisReport;
  isHistory?: boolean;
}

export const ReportSummary: React.FC<ReportSummaryProps> = ({
  data,
  isHistory = false,
}) => {
  const report: AnalysisReport = 'report' in data ? data.report : data;
  const recordId = report.meta.id;

  const { meta, summary, strategy, details, agentOpinions, factorScores, debateSummary, tradingPlan, historyComparison } = report;
  const reportLanguage = normalizeReportLanguage(meta.reportLanguage);
  const text = getReportText(reportLanguage);
  const modelUsed = (meta.modelUsed || '').trim();
  const shouldShowModel = Boolean(
    modelUsed && !['unknown', 'error', 'none', 'null', 'n/a'].includes(modelUsed.toLowerCase()),
  );

  return (
    <div className="space-y-5 pb-8 animate-fade-in">
      <ReportOverview
        meta={meta}
        summary={summary}
        details={details}
        isHistory={isHistory}
      />

      <KlineChartView
        stockCode={meta.stockCode}
        stockName={meta.stockName}
        language={reportLanguage}
      />

      <ReportStrategy strategy={strategy} language={reportLanguage} />

      {factorScores && <FactorScoreCard factorScores={factorScores} />}

      {factorScores?.scores && (
        <FactorRadarChart scores={factorScores.scores} language={reportLanguage} />
      )}

      <FinancialInsightsCard
        financialMetrics={details?.financialMetrics}
        sectorComparison={details?.sectorComparison}
        language={reportLanguage}
      />

      <RiskRewardCard
        riskMetrics={details?.riskMetrics}
        language={reportLanguage}
      />

      {historyComparison && (
        <HistoryComparisonCard
          comparison={historyComparison}
          currentScore={summary.sentimentScore}
          currentAdvice={summary.operationAdvice}
          language={reportLanguage}
        />
      )}

      {debateSummary && (
        <DebateConsensusPanel debateSummary={debateSummary} agentOpinions={agentOpinions} />
      )}

      {tradingPlan && <TradingPlanPanel tradingPlan={tradingPlan} />}

      <ReportNews recordId={recordId} limit={8} language={reportLanguage} />

      <ReportDetails details={details} recordId={recordId} language={reportLanguage} />

      {shouldShowModel && (
        <p className="px-1 text-xs text-muted-text">
          {text.analysisModel}: {modelUsed}
        </p>
      )}
    </div>
  );
};
