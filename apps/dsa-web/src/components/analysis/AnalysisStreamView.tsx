import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

type StreamEvent = {
  event_id: string;
  event_type: string;
  timestamp: number;
  data: Record<string, unknown>;
};

type AgentStep = {
  agentName: string;
  displayName: string;
  status: 'running' | 'done' | 'error';
  startTime: number;
  endTime?: number;
  thinking: string[];
  toolCalls: { tool: string; args: Record<string, unknown>; result?: string; duration?: number }[];
  opinion?: { signal: string; confidence: number; reasoning: string };
  challenge?: { challenges: Record<string, unknown>[]; weakestLinks: string[]; assessment: string };
};

type StreamState = {
  status: 'idle' | 'connecting' | 'running' | 'complete' | 'error';
  stockCode: string;
  stockName: string;
  mode: string;
  totalAgents: number;
  currentStep: number;
  agents: AgentStep[];
  debateRounds: { round: number; consensus: string[]; divergence: string[]; swing: string }[];
  scenario?: Record<string, unknown>;
  finalSignal?: string;
  finalConfidence?: number;
  duration?: number;
  error?: string;
};

const AGENT_DISPLAY: Record<string, string> = {
  technical: 'TECH',
  fundamental: 'FUND',
  sentiment: 'SENT',
  intel: 'INTL',
  risk: 'RISK',
  industry: 'INDS',
  capital_flow: 'FLOW',
  devils_advocate: 'DVIL',
  debate: 'DBAT',
  scenario_analysis: 'SCEN',
  factor_scoring: 'FACT',
  decision: 'DECI',
};

const SIGNAL_COLORS: Record<string, string> = {
  strong_buy: 'text-red-400',
  buy: 'text-red-300',
  hold: 'text-yellow-300',
  sell: 'text-emerald-300',
  strong_sell: 'text-emerald-400',
  bullish: 'text-red-400',
  bearish: 'text-emerald-400',
  neutral: 'text-yellow-300',
};

const AGENT_COLORS: Record<string, string> = {
  technical: 'border-blue-500/30',
  fundamental: 'border-purple-500/30',
  sentiment: 'border-orange-500/30',
  intel: 'border-cyan-500/30',
  risk: 'border-red-500/30',
  industry: 'border-emerald-500/30',
  capital_flow: 'border-amber-500/30',
  devils_advocate: 'border-rose-500/30',
  debate: 'border-indigo-500/30',
  scenario_analysis: 'border-teal-500/30',
  factor_scoring: 'border-violet-500/30',
  decision: 'border-yellow-500/30',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s}s`;
}

function getSessionToken(): string {
  try {
    const raw = localStorage.getItem('dsa_session') || localStorage.getItem('dsa_token') || '';
    if (raw) return raw;
    const cookies = document.cookie.split(';');
    for (const c of cookies) {
      const [k, v] = c.trim().split('=');
      if (k === 'dsa_session' && v) return v;
    }
  } catch { /* ignore */ }
  return '';
}

const SSE_EVENT_TYPES = [
  'connected',
  'pipeline_start',
  'agent_start',
  'agent_thinking',
  'agent_tool_call',
  'agent_tool_result',
  'agent_opinion',
  'agent_challenge',
  'agent_debate_round',
  'agent_scenario',
  'pipeline_complete',
  'pipeline_error',
  'progress',
  'heartbeat',
];

const initialState: StreamState = {
  status: 'idle',
  stockCode: '',
  stockName: '',
  mode: '',
  totalAgents: 0,
  currentStep: 0,
  agents: [],
  debateRounds: [],
};

type Props = {
  stockCode: string;
  stockName?: string;
  onComplete?: (result: { signal: string; confidence: number }) => void;
  onError?: (error: string) => void;
};

export const AnalysisStreamView: React.FC<Props> = ({ stockCode, stockName, onComplete, onError }) => {
  const [state, setState] = useState<StreamState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  const handleEvent = useCallback((eventType: string, data: Record<string, unknown>) => {
    switch (eventType) {
      case 'connected':
        setState(prev => ({ ...prev, status: 'running' }));
        break;
      case 'pipeline_start':
        setState(prev => ({
          ...prev,
          status: 'running',
          stockCode: (data.stock_code as string) || prev.stockCode,
          stockName: (data.stock_name as string) || prev.stockName,
          mode: (data.mode as string) || '',
          totalAgents: (data.total_agents as number) || 0,
          agents: [],
          debateRounds: [],
        }));
        break;
      case 'agent_start': {
        const agentName = data.agent_name as string;
        const displayName = (data.display_name as string) || AGENT_DISPLAY[agentName] || agentName;
        const step = (data.step as number) || 0;
        const total = (data.total_steps as number) || 0;
        setState(prev => ({
          ...prev,
          currentStep: step,
          totalAgents: total || prev.totalAgents,
          agents: [
            ...prev.agents,
            { agentName, displayName, status: 'running', startTime: Date.now() / 1000, thinking: [], toolCalls: [] },
          ],
        }));
        scrollToBottom();
        break;
      }
      case 'agent_thinking': {
        const an = data.agent_name as string;
        const thinking = data.thinking as string;
        setState(prev => ({
          ...prev,
          agents: prev.agents.map(a =>
            a.agentName === an && a.status === 'running'
              ? { ...a, thinking: [...a.thinking, thinking] }
              : a
          ),
        }));
        scrollToBottom();
        break;
      }
      case 'agent_tool_call': {
        const an2 = data.agent_name as string;
        const toolName = data.tool_name as string;
        const args = (data.arguments as Record<string, unknown>) || {};
        setState(prev => ({
          ...prev,
          agents: prev.agents.map(a =>
            a.agentName === an2 && a.status === 'running'
              ? { ...a, toolCalls: [...a.toolCalls, { tool: toolName, args, result: undefined }] }
              : a
          ),
        }));
        scrollToBottom();
        break;
      }
      case 'agent_tool_result': {
        const an3 = data.agent_name as string;
        const tn = data.tool_name as string;
        const result = (data.result_summary as string) || '';
        const duration = (data.duration as number) || 0;
        setState(prev => ({
          ...prev,
          agents: prev.agents.map(a =>
            a.agentName === an3 && a.status === 'running'
              ? {
                  ...a,
                  toolCalls: a.toolCalls.map((tc, i) =>
                    i === a.toolCalls.length - 1 && tc.tool === tn && !tc.result
                      ? { ...tc, result, duration }
                      : tc
                  ),
                }
              : a
          ),
        }));
        break;
      }
      case 'agent_opinion': {
        const an4 = data.agent_name as string;
        setState(prev => ({
          ...prev,
          agents: prev.agents.map(a =>
            a.agentName === an4 && a.status === 'running'
              ? {
                  ...a,
                  status: 'done' as const,
                  endTime: Date.now() / 1000,
                  opinion: {
                    signal: (data.signal as string) || 'hold',
                    confidence: (data.confidence as number) || 0.5,
                    reasoning: (data.reasoning as string) || '',
                  },
                }
              : a
          ),
        }));
        scrollToBottom();
        break;
      }
      case 'agent_challenge': {
        const an5 = data.agent_name as string;
        setState(prev => ({
          ...prev,
          agents: prev.agents.map(a =>
            a.agentName === an5 && a.status === 'running'
              ? {
                  ...a,
                  status: 'done' as const,
                  endTime: Date.now() / 1000,
                  challenge: {
                    challenges: (data.challenges as Record<string, unknown>[]) || [],
                    weakestLinks: (data.weakest_links as string[]) || [],
                    assessment: (data.overall_assessment as string) || '',
                  },
                }
              : a
          ),
        }));
        scrollToBottom();
        break;
      }
      case 'agent_debate_round':
        setState(prev => ({
          ...prev,
          debateRounds: [
            ...prev.debateRounds,
            {
              round: (data.round as number) || prev.debateRounds.length + 1,
              consensus: (data.consensus_points as string[]) || [],
              divergence: (data.divergence_points as string[]) || [],
              swing: (data.swing_argument as string) || '',
            },
          ],
        }));
        scrollToBottom();
        break;
      case 'agent_scenario':
        setState(prev => ({ ...prev, scenario: data }));
        scrollToBottom();
        break;
      case 'pipeline_complete':
        setState(prev => ({
          ...prev,
          status: 'complete',
          finalSignal: (data.signal as string) || '',
          finalConfidence: (data.confidence as number) || 0,
          duration: (data.duration as number) || 0,
        }));
        onCompleteRef.current?.({ signal: (data.signal as string) || '', confidence: (data.confidence as number) || 0 });
        break;
      case 'pipeline_error':
        setState(prev => ({
          ...prev,
          status: 'error',
          error: (data.error as string) || '分析失败',
        }));
        onErrorRef.current?.((data.error as string) || '分析失败');
        break;
      case 'progress':
        setState(prev => ({
          ...prev,
          currentStep: (data.step as number) || prev.currentStep,
        }));
        break;
      case 'heartbeat':
        break;
    }
  }, [scrollToBottom]);

  const startStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setState({ ...initialState, stockCode, stockName: stockName || '', status: 'connecting' });

    const token = getSessionToken();
    const base = `/api/v1/analysis/stream/${stockCode}`;
    const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setState(prev => ({ ...prev, status: 'running' }));
    };

    SSE_EVENT_TYPES.forEach(eventType => {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data) as StreamEvent;
          handleEvent(payload.event_type || eventType, payload.data || {});
        } catch {
          try {
            const fallback = JSON.parse(e.data) as Record<string, unknown>;
            handleEvent(eventType, fallback);
          } catch { /* ignore */ }
        }
      });
    });

    es.onerror = () => {
      setState(prev => {
        if (prev.status === 'running' || prev.status === 'connecting') {
          return { ...prev, status: 'error', error: '连接中断或认证失败' };
        }
        return prev;
      });
      es.close();
      eventSourceRef.current = null;
    };
  }, [stockCode, stockName, handleEvent]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const completedAgents = state.agents.filter(a => a.status === 'done');

  return (
    <div className="flex h-full flex-col overflow-hidden border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${
            state.status === 'running' ? 'bg-primary animate-pulse' :
            state.status === 'complete' ? 'bg-emerald-400' :
            state.status === 'error' ? 'bg-red-400' :
            'bg-muted-text'
          }`} />
          <span className="text-[11px] font-mono font-medium text-foreground">
            {state.stockName || state.stockCode || stockCode}
          </span>
          {state.mode && <span className="text-[10px] font-mono text-muted-text">{state.mode}</span>}
        </div>
        <div className="flex items-center gap-2">
          {state.status === 'running' && (
            <span className="text-[10px] font-mono text-muted-text">
              {state.currentStep}/{state.totalAgents}
            </span>
          )}
          {state.duration != null && state.duration > 0 && (
            <span className="text-[10px] font-mono text-muted-text">{formatDuration(state.duration)}</span>
          )}
          {state.status === 'idle' && (
            <button
              type="button"
              className="rounded-sm border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-mono text-primary hover:bg-primary/10 transition-colors"
              onClick={startStream}
            >
              [START]
            </button>
          )}
          {state.status === 'error' && (
            <button
              type="button"
              className="rounded-sm border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-mono text-primary hover:bg-primary/10 transition-colors"
              onClick={startStream}
            >
              [RETRY]
            </button>
          )}
        </div>
      </div>

      {state.status === 'running' && state.totalAgents > 0 && (
        <div className="h-px bg-border">
          <div
            className="h-full bg-primary/50 transition-all duration-500"
            style={{ width: `${(completedAgents.length / state.totalAgents) * 100}%` }}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]">
        {state.status === 'idle' && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-text">
              <div className="text-[10px] mb-1">{'>'} DEEP ANALYSIS ENGINE</div>
              <div className="text-[10px]">CLICK [START] TO BEGIN MULTI-AGENT ANALYSIS</div>
            </div>
          </div>
        )}

        {state.status === 'connecting' && (
          <div className="flex items-center gap-2 text-muted-text">
            <span className="animate-pulse">●</span>
            <span>CONNECTING...</span>
          </div>
        )}

        {state.agents.map((agent, idx) => (
          <AgentStepCard key={`${agent.agentName}-${idx}`} agent={agent} />
        ))}

        {state.debateRounds.map((dr) => (
          <div key={`debate-${dr.round}`} className="border border-indigo-500/20 bg-indigo-500/5 p-2 rounded-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] text-indigo-300">[DEBATE R{dr.round}]</span>
            </div>
            {dr.consensus.length > 0 && (
              <div className="mb-1">
                <span className="text-[10px] text-muted-text">CONSENSUS:</span>
                {dr.consensus.map((c, i) => (
                  <div key={i} className="ml-2 text-emerald-300/70">+ {c}</div>
                ))}
              </div>
            )}
            {dr.divergence.length > 0 && (
              <div className="mb-1">
                <span className="text-[10px] text-muted-text">DIVERGENCE:</span>
                {dr.divergence.map((d, i) => (
                  <div key={i} className="ml-2 text-red-300/70">- {d}</div>
                ))}
              </div>
            )}
            {dr.swing && (
              <div>
                <span className="text-[10px] text-muted-text">SWING:</span>
                <span className="text-yellow-300/70 ml-1">{dr.swing}</span>
              </div>
            )}
          </div>
        ))}

        {state.scenario && (
          <ScenarioCard data={state.scenario} />
        )}

        {state.status === 'complete' && (
          <div className="border border-emerald-500/20 bg-emerald-500/5 p-2 rounded-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-emerald-400">[COMPLETE]</span>
              {state.duration != null && (
                <span className="text-[10px] text-muted-text">{formatDuration(state.duration)}</span>
              )}
            </div>
            {state.finalSignal && (
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${SIGNAL_COLORS[state.finalSignal] || 'text-foreground/70'}`}>
                  {state.finalSignal.replace('_', ' ').toUpperCase()}
                </span>
                {state.finalConfidence != null && (
                  <span className="text-muted-text">
                    CONF {(state.finalConfidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {state.status === 'error' && state.error && (
          <div className="border border-red-500/20 bg-red-500/5 p-2 rounded-sm">
            <span className="text-red-400">[错误] {state.error}</span>
          </div>
        )}

        <div ref={logEndRef} />
      </div>
    </div>
  );
};

const AgentStepCard: React.FC<{ agent: AgentStep }> = ({ agent }) => {
  const [expanded, setExpanded] = useState(false);
  const colorClass = AGENT_COLORS[agent.agentName] || 'border-border';
  const tag = AGENT_DISPLAY[agent.agentName] || agent.agentName.slice(0, 4).toUpperCase();
  const elapsed = agent.endTime ? agent.endTime - agent.startTime : Date.now() / 1000 - agent.startTime;

  return (
    <div className={`border-l-2 ${colorClass} bg-foreground/[0.02]`}>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-foreground/[0.03] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[10px] text-muted-text w-10 shrink-0">{tag}</span>
        <span className="text-[11px] text-foreground/80 flex-1 truncate">{agent.displayName}</span>
        {agent.status === 'running' && (
          <span className="flex items-center gap-1">
            <span className="h-1 w-1 animate-pulse bg-primary" />
            <span className="text-[10px] text-primary/60">{formatDuration(elapsed)}</span>
          </span>
        )}
        {agent.status === 'done' && agent.opinion && (
          <span className={`text-[10px] font-medium ${SIGNAL_COLORS[agent.opinion.signal] || 'text-foreground/50'}`}>
            {agent.opinion.signal.replace('_', ' ').toUpperCase()}
          </span>
        )}
        {agent.status === 'done' && agent.challenge && (
          <span className="text-[10px] text-rose-300/70 truncate max-w-[120px]">
            {agent.challenge.assessment}
          </span>
        )}
        <span className="text-muted-text text-[10px]">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-2 py-1.5 space-y-1.5">
          {agent.thinking.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-text mb-0.5">THINKING</div>
              {agent.thinking.map((t, i) => (
                <div key={i} className="ml-2 mb-0.5 text-foreground/50 border-l border-border pl-2">
                  {t}
                </div>
              ))}
            </div>
          )}

          {agent.toolCalls.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-text mb-0.5">TOOLS</div>
              {agent.toolCalls.map((tc, i) => (
                <div key={i} className="ml-2 mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-primary/60">▸</span>
                    <span className="text-foreground/60">{tc.tool}</span>
                    {tc.duration != null && (
                      <span className="text-muted-text">{tc.duration.toFixed(1)}s</span>
                    )}
                  </div>
                  {tc.result && (
                    <div className="ml-3 mt-0.5 text-[10px] text-foreground/35 line-clamp-2">
                      {tc.result}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {agent.opinion && (
            <div>
              <div className="text-[10px] text-muted-text mb-0.5">OPINION</div>
              <div className="ml-2 text-foreground/60">{agent.opinion.reasoning}</div>
            </div>
          )}

          {agent.challenge && (
            <div>
              <div className="text-[10px] text-muted-text mb-0.5">CHALLENGE</div>
              {agent.challenge.weakestLinks.length > 0 && (
                <div className="ml-2">
                  {agent.challenge.weakestLinks.map((wl, i) => (
                    <div key={i} className="text-rose-300/60">• {wl}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ScenarioCard: React.FC<{ data: Record<string, unknown> }> = ({ data }) => {
  const scenarios = (data.scenarios as Record<string, Record<string, unknown>>) || {};
  const swingFactors = (data.swing_factors as Record<string, unknown>[]) || [];

  return (
    <div className="border border-teal-500/20 bg-teal-500/5 p-2 rounded-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-teal-300">[SCENARIO]</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Object.entries(scenarios).map(([key, val]) => {
          const prob = (val?.probability as number) || 0;
          const target = val?.price_target;
          const label = key === 'bull' ? 'BULL' : key === 'base' ? 'BASE' : 'BEAR';
          const color = key === 'bull' ? 'text-red-300' : key === 'bear' ? 'text-emerald-300' : 'text-yellow-300';
          return (
            <div key={key} className="bg-foreground/[0.03] p-1.5 rounded-sm">
              <div className={`text-[10px] font-medium ${color}`}>{label}</div>
              <div className="text-sm font-bold text-foreground/80">{(prob * 100).toFixed(0)}%</div>
              {target != null && <div className="text-[10px] text-muted-text">TGT: {String(target)}</div>}
            </div>
          );
        })}
      </div>
      {swingFactors.length > 0 && (
        <div className="mt-1.5">
          <span className="text-[10px] text-muted-text">SWING:</span>
          {swingFactors.map((sf, i) => (
            <div key={i} className="ml-2 text-foreground/50">• {String(sf)}</div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnalysisStreamView;
