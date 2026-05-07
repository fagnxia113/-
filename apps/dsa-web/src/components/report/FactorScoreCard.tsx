import type React from 'react';
import type { FactorScores, FactorDimensionScores } from '../../types/analysis';
import { Card } from '../common';

interface FactorScoreCardProps {
  factorScores: FactorScores;
}

const DIMENSION_CONFIG: Record<keyof FactorDimensionScores, { label: string; icon: string; gradient: string; glowColor: string }> = {
  technical: { label: '技术面', icon: '📈', gradient: 'from-cyan-500 to-blue-500', glowColor: 'rgba(0, 212, 255, 0.15)' },
  fundamental: { label: '基本面', icon: '📊', gradient: 'from-purple-500 to-indigo-500', glowColor: 'rgba(168, 85, 247, 0.15)' },
  sentiment: { label: '情绪面', icon: '💭', gradient: 'from-amber-500 to-orange-500', glowColor: 'rgba(245, 158, 11, 0.15)' },
  capitalFlow: { label: '资金面', icon: '💰', gradient: 'from-emerald-500 to-teal-500', glowColor: 'rgba(16, 185, 129, 0.15)' },
  composite: { label: '综合评分', icon: '🎯', gradient: 'from-cyan-400 to-purple-500', glowColor: 'rgba(0, 212, 255, 0.2)' },
};

const getScoreColor = (score: number): string => {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-cyan-400';
  if (score >= 40) return 'text-yellow-400';
  if (score >= 20) return 'text-orange-400';
  return 'text-red-400';
};

const getCompositeGradient = (score: number): string => {
  if (score >= 80) return 'from-emerald-400 to-cyan-400';
  if (score >= 60) return 'from-cyan-400 to-blue-400';
  if (score >= 40) return 'from-yellow-400 to-amber-400';
  if (score >= 20) return 'from-orange-400 to-red-400';
  return 'from-red-400 to-rose-500';
};

const CompositeRing: React.FC<{ score: number }> = ({ score }) => {
  const radius = 52;
  const strokeWidth = 6;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const gradientId = 'composite-ring-gradient';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={radius * 2}
        height={radius * 2}
        className="transform -rotate-90"
        style={{ filter: `drop-shadow(0 0 8px ${score >= 60 ? 'rgba(0, 212, 255, 0.3)' : score >= 40 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 68, 102, 0.3)'})` }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={score >= 60 ? '#00d4ff' : score >= 40 ? '#f59e0b' : '#ff4466'} />
            <stop offset="100%" stopColor={score >= 60 ? '#a855f7' : score >= 40 ? '#f97316' : '#ef4444'} />
          </linearGradient>
        </defs>
        <circle
          stroke="hsl(var(--foreground) / 0.06)"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke={`url(#${gradientId})`}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold font-mono bg-gradient-to-br ${getCompositeGradient(score)} bg-clip-text text-transparent`}>
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
};

export const FactorScoreCard: React.FC<FactorScoreCardProps> = ({ factorScores }) => {
  const { scores, compositeInterpretation, keyStrengths, keyWeaknesses, dimensionConflicts } = factorScores;

  const dimensions: { key: keyof FactorDimensionScores; score: number }[] = [
    { key: 'technical', score: scores.technical ?? 0 },
    { key: 'fundamental', score: scores.fundamental ?? 0 },
    { key: 'sentiment', score: scores.sentiment ?? 0 },
    { key: 'capitalFlow', score: scores.capitalFlow ?? 0 },
  ];

  return (
    <Card variant="gradient" padding="md" className="home-panel-card text-left">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500" />
          <h3 className="text-sm font-medium tracking-wide text-foreground">量化因子评分</h3>
        </div>
        {compositeInterpretation && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${compositeInterpretation.includes('强烈看多') || compositeInterpretation.includes('偏多') ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : compositeInterpretation.includes('强烈看空') || compositeInterpretation.includes('偏空') ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'}`}>
            {compositeInterpretation}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center mb-6">
        <CompositeRing score={scores.composite ?? 0} />
      </div>

      <div className="space-y-3.5">
        {dimensions.map(({ key, score }) => {
          const config = DIMENSION_CONFIG[key];
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-secondary-text">
                  <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px]" style={{ background: config.glowColor }}>
                    {config.icon}
                  </span>
                  <span className="font-medium">{config.label}</span>
                </span>
                <span className={`font-mono font-bold text-sm ${getScoreColor(score)}`}>
                  {Math.round(score)}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--foreground) / 0.06)' }}>
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${config.gradient} transition-all duration-700 ease-out relative`}
                  style={{ width: `${Math.max(3, score)}%` }}
                >
                  <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 8px ${config.glowColor}` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {(keyStrengths && keyStrengths.length > 0 || keyWeaknesses && keyWeaknesses.length > 0 || dimensionConflicts && dimensionConflicts.length > 0) && (
        <div className="mt-5 pt-4 border-t border-subtle space-y-3">
          {keyStrengths && keyStrengths.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-1.5 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                核心优势
              </div>
              {keyStrengths.map((s, i) => (
                <div key={i} className="text-xs text-secondary-text ml-5 mb-1 leading-relaxed">• {s}</div>
              ))}
            </div>
          )}

          {keyWeaknesses && keyWeaknesses.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs text-red-400 mb-1.5 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                风险因素
              </div>
              {keyWeaknesses.map((w, i) => (
                <div key={i} className="text-xs text-secondary-text ml-5 mb-1 leading-relaxed">• {w}</div>
              ))}
            </div>
          )}

          {dimensionConflicts && dimensionConflicts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs text-yellow-400 mb-1.5 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                维度冲突
              </div>
              {dimensionConflicts.map((c, i) => (
                <div key={i} className="text-xs text-secondary-text ml-5 mb-1 leading-relaxed">• {c}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
