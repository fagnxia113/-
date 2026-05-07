import type React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { FactorDimensionScores, ReportLanguage } from '../../types/analysis';
import { Card } from '../common';
import { normalizeReportLanguage } from '../../utils/reportLanguage';

interface FactorRadarChartProps {
  scores: FactorDimensionScores;
  language?: ReportLanguage;
}

const DIMENSION_KEYS: (keyof FactorDimensionScores)[] = [
  'technical',
  'fundamental',
  'sentiment',
  'capitalFlow',
];

const DIMENSION_META_ZH: Record<string, { label: string; color: string }> = {
  technical: { label: '技术面', color: '#00d4ff' },
  fundamental: { label: '基本面', color: '#a855f7' },
  sentiment: { label: '情绪面', color: '#f59e0b' },
  capitalFlow: { label: '资金面', color: '#10b981' },
};

const DIMENSION_META_EN: Record<string, { label: string; color: string }> = {
  technical: { label: 'Technical', color: '#00d4ff' },
  fundamental: { label: 'Fundamental', color: '#a855f7' },
  sentiment: { label: 'Sentiment', color: '#f59e0b' },
  capitalFlow: { label: 'Capital Flow', color: '#10b981' },
};

const coerceNum = (v: number | string | undefined | null): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

export const FactorRadarChart: React.FC<FactorRadarChartProps> = ({
  scores,
  language = 'zh',
}) => {
  const reportLanguage = normalizeReportLanguage(language);
  const meta = reportLanguage === 'en' ? DIMENSION_META_EN : DIMENSION_META_ZH;

  const data = DIMENSION_KEYS.map((key) => ({
    dimension: meta[key].label,
    value: coerceNum(scores[key]),
    fullMark: 100,
  }));

  return (
    <Card variant="bordered" padding="md" className="home-panel-card text-left">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500" />
        <h3 className="text-sm font-medium tracking-wide text-foreground">
          {reportLanguage === 'en' ? 'Factor Radar' : '因子雷达图'}
        </h3>
      </div>
      <div className="w-full" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="hsl(var(--foreground) / 0.08)" />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fill: 'hsl(var(--secondary-text))', fontSize: 12 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: 'hsl(var(--muted-text))', fontSize: 10 }}
              tickCount={5}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--subtle))',
                borderRadius: 8,
                fontSize: 12,
                color: 'hsl(var(--foreground))',
              }}
            />
            <Radar
              name={reportLanguage === 'en' ? 'Score' : '评分'}
              dataKey="value"
              stroke="#00d4ff"
              fill="#00d4ff"
              fillOpacity={0.18}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
