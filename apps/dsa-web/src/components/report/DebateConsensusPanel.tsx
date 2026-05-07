import type React from 'react';
import type { DebateSummary, AgentOpinions, AgentOpinion } from '../../types/analysis';
import { Card, Badge } from '../common';

interface DebateConsensusPanelProps {
  debateSummary: DebateSummary;
  agentOpinions?: AgentOpinions;
}

const AGENT_LABELS: Record<string, { label: string; icon: string; accentColor: string }> = {
  technical: { label: '技术分析', icon: '📈', accentColor: '#00d4ff' },
  intel: { label: '情报分析', icon: '🔍', accentColor: '#38bdf8' },
  risk: { label: '风控分析', icon: '🛡️', accentColor: '#f97316' },
  industry: { label: '行业分析', icon: '🏭', accentColor: '#8b5cf6' },
  capitalFlow: { label: '资金分析', icon: '💰', accentColor: '#10b981' },
  sentiment: { label: '情绪分析', icon: '💭', accentColor: '#f59e0b' },
  fundamental: { label: '基本面', icon: '📊', accentColor: '#6366f1' },
  debate: { label: '辩论共识', icon: '⚖️', accentColor: '#a855f7' },
  factorScoring: { label: '因子评分', icon: '🎯', accentColor: '#06b6d4' },
  decision: { label: '最终决策', icon: '🏁', accentColor: '#ec4899' },
};

const getSignalVariant = (signal: string): 'success' | 'warning' | 'danger' | 'default' => {
  const s = (signal || '').toLowerCase();
  if (s.includes('strong_buy') || s.includes('buy')) return 'success';
  if (s.includes('strong_sell') || s.includes('sell')) return 'danger';
  if (s === 'hold') return 'warning';
  return 'default';
};

const getSignalLabel = (signal: string): string => {
  const s = (signal || '').toLowerCase();
  if (s === 'strong_buy') return '强烈看多';
  if (s === 'buy') return '看多';
  if (s === 'hold') return '中性';
  if (s === 'sell') return '看空';
  if (s === 'strong_sell') return '强烈看空';
  return signal;
};

const getConfidenceBarWidth = (confidence: number): string => `${Math.max(5, Math.round(confidence * 100))}%`;

const AgentOpinionCard: React.FC<{ agentKey: string; opinion: AgentOpinion }> = ({ agentKey, opinion }) => {
  const meta = AGENT_LABELS[agentKey] || { label: agentKey, icon: '📋', accentColor: '#94a3b8' };

  return (
    <div
      className="relative rounded-xl border border-subtle overflow-hidden group hover:border-subtle-hover transition-colors duration-200"
      style={{ background: `linear-gradient(135deg, ${meta.accentColor}08, transparent)` }}
    >
      <div className="absolute top-0 left-0 w-0.5 h-full" style={{ background: meta.accentColor }} />
      <div className="px-3 py-2.5 pl-4">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{meta.icon}</span>
            <span className="text-xs font-medium text-foreground">{meta.label}</span>
          </div>
          <Badge variant={getSignalVariant(opinion.signal)} className="text-[10px] px-1.5 py-0">
            {getSignalLabel(opinion.signal)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--foreground) / 0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: getConfidenceBarWidth(opinion.confidence), background: meta.accentColor }}
            />
          </div>
          <span className="text-[10px] font-mono text-secondary-text">{Math.round(opinion.confidence * 100)}%</span>
        </div>
      </div>
    </div>
  );
};

export const DebateConsensusPanel: React.FC<DebateConsensusPanelProps> = ({
  debateSummary,
  agentOpinions,
}) => {
  const { consensusPoints, divergencePoints, keyDebates, blindSpotsIdentified } = debateSummary;

  return (
    <Card variant="gradient" padding="md" className="home-panel-card text-left">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-purple-400 to-cyan-400" />
        <h3 className="text-sm font-medium tracking-wide text-foreground">投资委员会辩论</h3>
      </div>

      {agentOpinions && (
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {Object.entries(agentOpinions).map(([key, opinion]) => {
            if (!opinion) return null;
            return <AgentOpinionCard key={key} agentKey={key} opinion={opinion} />;
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {consensusPoints && consensusPoints.length > 0 && (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-2.5 font-semibold">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              共识观点
            </div>
            <div className="space-y-1.5">
              {consensusPoints.map((point, i) => (
                <div key={i} className="text-xs text-secondary-text leading-relaxed pl-1">
                  <span className="text-emerald-500 mr-1.5">•</span>{point}
                </div>
              ))}
            </div>
          </div>
        )}

        {divergencePoints && divergencePoints.length > 0 && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3.5">
            <div className="flex items-center gap-1.5 text-xs text-yellow-400 mb-2.5 font-semibold">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
              分歧观点
            </div>
            <div className="space-y-1.5">
              {divergencePoints.map((point, i) => (
                <div key={i} className="text-xs text-secondary-text leading-relaxed pl-1">
                  <span className="text-yellow-500 mr-1.5">•</span>{point}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {keyDebates && keyDebates.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 text-xs text-cyan-400 mb-3 font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            关键辩论
          </div>
          <div className="space-y-3">
            {keyDebates.map((debate, i) => (
              <div
                key={i}
                className="rounded-xl border border-subtle overflow-hidden"
                style={{ background: 'linear-gradient(180deg, hsl(var(--card) / 0.5), hsl(var(--elevated) / 0.3))' }}
              >
                <div className="px-3.5 py-2.5 border-b border-subtle">
                  <div className="text-xs font-semibold text-foreground">{debate.topic}</div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-subtle">
                  <div className="px-3.5 py-2.5" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.06), transparent)' }}>
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 mb-1 font-semibold uppercase tracking-wider">
                      <span>🐂</span> 多方
                    </div>
                    <div className="text-xs text-secondary-text leading-relaxed">{debate.bullishArgument}</div>
                  </div>
                  <div className="px-3.5 py-2.5" style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06), transparent)' }}>
                    <div className="flex items-center gap-1 text-[10px] text-red-400 mb-1 font-semibold uppercase tracking-wider">
                      <span>🐻</span> 空方
                    </div>
                    <div className="text-xs text-secondary-text leading-relaxed">{debate.bearishArgument}</div>
                  </div>
                </div>
                <div className="px-3.5 py-2 border-t border-subtle" style={{ background: 'linear-gradient(90deg, rgba(0, 212, 255, 0.04), rgba(168, 85, 247, 0.04))' }}>
                  <div className="flex items-center gap-1.5 text-xs text-cyan-400">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="leading-relaxed">{debate.resolution}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {blindSpotsIdentified && blindSpotsIdentified.length > 0 && (
        <div className="rounded-md border border-orange-500/20 bg-orange-500/5 p-3.5">
          <div className="flex items-center gap-1.5 text-xs text-orange-400 mb-2 font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            分析盲点
          </div>
          <div className="space-y-1.5">
            {blindSpotsIdentified.map((spot, i) => (
              <div key={i} className="text-xs text-secondary-text leading-relaxed pl-1">
                <span className="text-orange-500 mr-1.5">•</span>{spot}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
