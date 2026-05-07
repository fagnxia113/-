import type React from 'react';
import type { TradingPlan as TradingPlanType } from '../../types/analysis';
import { Card } from '../common';

interface TradingPlanPanelProps {
  tradingPlan: TradingPlanType;
}

const BatchStep: React.FC<{ index: number; condition: string; positionPct: number; priceLevel?: number; isLast: boolean }> = ({
  index,
  condition,
  positionPct,
  priceLevel,
  isLast,
}) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div className="w-7 h-7 rounded-full border-2 border-cyan-500/40 bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-bold text-cyan-400 font-mono">{index + 1}</span>
      </div>
      {!isLast && <div className="w-px flex-1 bg-gradient-to-b from-cyan-500/30 to-transparent my-1" />}
    </div>
    <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-3'}`}>
      <div className="rounded-lg border border-subtle px-3 py-2.5" style={{ background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.04), transparent)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-foreground font-medium">{condition}</span>
          <span className="text-xs font-bold text-cyan-400 font-mono">{positionPct}%</span>
        </div>
        {priceLevel != null && (
          <div className="text-[11px] text-secondary-text font-mono">¥{priceLevel}</div>
        )}
      </div>
    </div>
  </div>
);

const ProfitTarget: React.FC<{ index: number; action: string; priceLevel?: number; condition?: string }> = ({
  index,
  action,
  priceLevel,
  condition,
}) => {
  const opacity = 1 - index * 0.15;
  return (
    <div
      className="rounded-lg border border-emerald-500/20 px-3 py-2.5"
      style={{ background: `rgba(16, 185, 129, ${0.06 * opacity})` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <span className="text-[9px] font-bold text-emerald-400 font-mono">T{index + 1}</span>
          </div>
          <span className="text-xs text-foreground">{action}</span>
        </div>
        {priceLevel != null && (
          <span className="text-xs font-bold text-emerald-400 font-mono">¥{priceLevel}</span>
        )}
      </div>
      {condition && (
        <div className="text-[10px] text-secondary-text mt-1 ml-7">{condition}</div>
      )}
    </div>
  );
};

export const TradingPlanPanel: React.FC<TradingPlanPanelProps> = ({ tradingPlan }) => {
  const { entryStrategy, profitTargets, stopLoss, positionManagement } = tradingPlan;

  return (
    <Card variant="gradient" padding="md" className="home-panel-card text-left">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-cyan-400" />
        <h3 className="text-sm font-medium tracking-wide text-foreground">操盘方案</h3>
      </div>

      {entryStrategy && (
        <div className="mb-5">
          <div className="flex items-center gap-1.5 text-xs text-cyan-400 mb-3 font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            建仓策略{entryStrategy.method ? ` · ${entryStrategy.method}` : ''}
          </div>
          {entryStrategy.batches && entryStrategy.batches.length > 0 ? (
            <div className="ml-0.5">
              {entryStrategy.batches.map((batch, i) => (
                <BatchStep
                  key={i}
                  index={i}
                  condition={batch.condition}
                  positionPct={batch.positionPct}
                  priceLevel={batch.priceLevel ?? undefined}
                  isLast={i === entryStrategy.batches!.length - 1}
                />
              ))}
            </div>
          ) : (
            <div className="text-xs text-secondary-text ml-3 py-2">暂无分批建仓方案</div>
          )}
        </div>
      )}

      {profitTargets && profitTargets.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-3 font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            止盈目标
          </div>
          <div className="space-y-2">
            {profitTargets.map((target, i) => (
              <ProfitTarget
                key={i}
                index={i}
                action={target.action}
                priceLevel={target.priceLevel ?? undefined}
                condition={target.condition ?? undefined}
              />
            ))}
          </div>
        </div>
      )}

      {stopLoss && (
        <div className="mb-5">
          <div className="flex items-center gap-1.5 text-xs text-red-400 mb-3 font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            止损策略
          </div>
          <div className="rounded-xl border border-red-500/20 overflow-hidden" style={{ background: 'rgba(239, 68, 68, 0.03)' }}>
            <div className="grid grid-cols-1 divide-y divide-red-500/10">
              {stopLoss.technicalStop != null && (
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" style={{ boxShadow: '0 0 6px rgba(239, 68, 68, 0.4)' }} />
                    <span className="text-xs text-secondary-text">技术止损</span>
                  </div>
                  <span className="text-xs text-red-400 font-mono font-bold">¥{stopLoss.technicalStop}</span>
                </div>
              )}
              {stopLoss.timeStop && (
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" style={{ boxShadow: '0 0 6px rgba(249, 115, 22, 0.4)' }} />
                    <span className="text-xs text-secondary-text">时间止损</span>
                  </div>
                  <span className="text-xs text-orange-400">{stopLoss.timeStop}</span>
                </div>
              )}
              {stopLoss.fundamentalStop && (
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" style={{ boxShadow: '0 0 6px rgba(245, 158, 11, 0.4)' }} />
                    <span className="text-xs text-secondary-text">基本面止损</span>
                  </div>
                  <span className="text-xs text-amber-400">{stopLoss.fundamentalStop}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {positionManagement && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-yellow-400 mb-3 font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
            仓位管理
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {positionManagement.initialPositionPct != null && (
              <div className="rounded-md border border-subtle p-3 text-center relative overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(0, 212, 255, 0.06), transparent)' }}>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
                <div className="text-[10px] text-secondary-text mb-1">初始仓位</div>
                <div className="text-base font-bold text-foreground font-mono">{positionManagement.initialPositionPct}%</div>
              </div>
            )}
            {positionManagement.maxPositionPct != null && (
              <div className="rounded-xl border border-subtle p-3 text-center relative overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.06), transparent)' }}>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
                <div className="text-[10px] text-secondary-text mb-1">最大仓位</div>
                <div className="text-base font-bold text-foreground font-mono">{positionManagement.maxPositionPct}%</div>
              </div>
            )}
            {positionManagement.reviewFrequency && (
              <div className="rounded-md border border-subtle p-3 text-center relative overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.06), transparent)' }}>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
                <div className="text-[10px] text-secondary-text mb-1">复盘频率</div>
                <div className="text-base font-bold text-foreground">{positionManagement.reviewFrequency}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
