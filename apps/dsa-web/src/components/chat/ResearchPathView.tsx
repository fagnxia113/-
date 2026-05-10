import React, { useEffect, useRef, useState } from 'react';
import type { ProgressStep } from '../../stores/agentChatStore';

type PhaseId = 'overview' | 'tech' | 'fundamental' | 'news' | 'conclude';

interface Phase {
  id: PhaseId;
  label: string;
  subLabel: string;
  icon: string;
  tools: string[];
}

const PHASES: Phase[] = [
  {
    id: 'overview',
    label: '全景扫描',
    subLabel: '大盘+个股定位',
    icon: '🌍',
    tools: ['get_market_indices', 'get_sector_rankings', 'get_realtime_quote'],
  },
  {
    id: 'tech',
    label: '量价深度',
    subLabel: '技术+筹码+资金',
    icon: '📈',
    tools: ['get_daily_history', 'analyze_trend', 'get_volume_analysis', 'analyze_pattern', 'get_chip_distribution', 'get_capital_flow'],
  },
  {
    id: 'fundamental',
    label: '基本面+估值',
    subLabel: '财务+估值水位',
    icon: '🏦',
    tools: ['get_stock_info', 'get_financial_deep_analysis', 'get_valuation_percentile'],
  },
  {
    id: 'news',
    label: '消息+情绪',
    subLabel: '新闻+市场心理',
    icon: '📰',
    tools: ['search_stock_news', 'search_comprehensive_intel', 'web_search', 'web_scrape', 'get_stock_sentiment'],
  },
  {
    id: 'conclude',
    label: '交叉验证',
    subLabel: '综合研判+策略',
    icon: '🎯',
    tools: ['sequential_thinking'],
  },
];

const ALL_PHASE_TOOLS = new Set(PHASES.flatMap((p) => p.tools));

const TOOL_DISPLAY: Record<string, string> = {
  get_market_indices: '大盘指数',
  get_sector_rankings: '板块排名',
  get_realtime_quote: '实时行情',
  get_daily_history: 'K线数据',
  analyze_trend: '技术指标',
  get_volume_analysis: '量价分析',
  analyze_pattern: 'K线形态',
  get_chip_distribution: '筹码分布',
  get_capital_flow: '资金流向',
  get_stock_info: '基本面',
  get_financial_deep_analysis: '财务深度',
  get_valuation_percentile: '估值百分位',
  search_stock_news: '新闻搜索',
  search_comprehensive_intel: '综合情报',
  web_search: '网络搜索',
  web_scrape: '网页抓取',
  get_stock_sentiment: '市场情绪',
  sequential_thinking: '结构化思考',
};

type NodeStatus = 'pending' | 'running' | 'done' | 'failed';

interface ToolNode {
  tool: string;
  displayName: string;
  status: NodeStatus;
  duration?: number;
  phaseId: PhaseId;
}

function getPhaseForTool(toolName: string): PhaseId {
  if (toolName === 'sequential_thinking') {
    return 'conclude';
  }
  for (const phase of PHASES) {
    if (phase.tools.includes(toolName)) return phase.id;
  }
  return 'overview';
}

function buildNodes(steps: ProgressStep[]): ToolNode[] {
  const nodes: ToolNode[] = [];
  const seen = new Map<string, number>();

  for (const step of steps) {
    if (step.type === 'tool_start') {
      const tool = step.tool || '';
      if (!ALL_PHASE_TOOLS.has(tool) && tool !== 'sequential_thinking') continue;
      const idx = seen.get(tool) ?? 0;
      seen.set(tool, idx + 1);
      const key = idx > 0 ? `${tool}_${idx}` : tool;
      nodes.push({
        tool: key,
        displayName: TOOL_DISPLAY[tool] || tool,
        status: 'running',
        phaseId: getPhaseForTool(tool),
      });
    } else if (step.type === 'tool_done') {
      const tool = step.tool || '';
      if (!ALL_PHASE_TOOLS.has(tool) && tool !== 'sequential_thinking') continue;
      let runningIdx = -1;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if ((n.tool === tool || n.tool.startsWith(tool + '_')) && n.status === 'running') {
          runningIdx = i;
          break;
        }
      }
      if (runningIdx >= 0) {
        nodes[runningIdx].status = step.success ? 'done' : 'failed';
        nodes[runningIdx].duration = step.duration;
      }
    }
  }

  return nodes;
}

function getPhaseStatus(nodes: ToolNode[], phaseId: PhaseId): NodeStatus {
  const phaseNodes = nodes.filter((n) => n.phaseId === phaseId);
  if (phaseNodes.length === 0) return 'pending';
  if (phaseNodes.some((n) => n.status === 'running')) return 'running';
  if (phaseNodes.some((n) => n.status === 'failed') && !phaseNodes.some((n) => n.status === 'running')) {
    const doneCount = phaseNodes.filter((n) => n.status === 'done').length;
    if (doneCount > 0) return 'done';
    return 'failed';
  }
  if (phaseNodes.every((n) => n.status === 'done')) return 'done';
  return 'pending';
}

const PhaseNode: React.FC<{
  phase: Phase;
  status: NodeStatus;
  nodes: ToolNode[];
  isActive: boolean;
}> = ({ phase, status, nodes, isActive }) => {
  const phaseNodes = nodes.filter((n) => n.phaseId === phase.id);

  return (
    <div className={`research-phase ${isActive ? 'research-phase-active' : ''} research-phase-${status}`}>
      <div className="research-phase-header">
        <div className="research-phase-indicator">
          {status === 'running' ? (
            <div className="research-pulse-ring">
              <div className="research-pulse-core" />
            </div>
          ) : status === 'done' ? (
            <div className="research-check-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          ) : status === 'failed' ? (
            <div className="research-fail-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          ) : (
            <div className="research-pending-dot" />
          )}
        </div>
        <span className="research-phase-icon">{phase.icon}</span>
        <div className="research-phase-text">
          <span className="research-phase-label">{phase.label}</span>
          <span className="research-phase-sublabel">{phase.subLabel}</span>
        </div>
        {status === 'running' && (
          <span className="research-phase-status-text research-phase-status-running">进行中</span>
        )}
        {status === 'done' && (
          <span className="research-phase-status-text research-phase-status-done">完成</span>
        )}
      </div>

      {phaseNodes.length > 0 && (
        <div className="research-tool-list">
          {phaseNodes.map((node) => (
            <div key={node.tool} className={`research-tool-item research-tool-${node.status}`}>
              <div className="research-tool-dot" />
              <span className="research-tool-name">{node.displayName}</span>
              {node.status === 'running' && (
                <span className="research-tool-spinner" />
              )}
              {node.status === 'done' && node.duration != null && (
                <span className="research-tool-duration">{node.duration.toFixed(1)}s</span>
              )}
              {node.status === 'failed' && (
                <span className="research-tool-failed-text">失败</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PhaseConnector: React.FC<{ fromStatus: NodeStatus }> = ({ fromStatus }) => (
  <div className={`research-connector research-connector-${fromStatus === 'done' ? 'active' : fromStatus === 'running' ? 'running' : 'idle'}`}>
    <div className="research-connector-line" />
    <svg className="research-connector-arrow" width="10" height="10" viewBox="0 0 10 10">
      <path d="M5 0 L10 5 L5 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

interface ResearchPathViewProps {
  steps: ProgressStep[];
  isGenerating?: boolean;
}

const ResearchPathView: React.FC<ResearchPathViewProps> = ({ steps, isGenerating }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevStepCountRef = useRef(0);

  const nodes = buildNodes(steps);

  const activePhaseIdx = PHASES.findIndex((phase) => {
    const s = getPhaseStatus(nodes, phase.id);
    return s === 'running';
  });

  const currentPhaseIdx = activePhaseIdx >= 0 ? activePhaseIdx : PHASES.length - 1;

  useEffect(() => {
    if (autoScroll && containerRef.current && steps.length > prevStepCountRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    prevStepCountRef.current = steps.length;
  }, [steps, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(nearBottom);
  };

  return (
    <div className="research-path-container" ref={containerRef} onScroll={handleScroll}>
      <div className="research-path-title">
        <svg className="research-path-title-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>研究路径</span>
        {isGenerating && <span className="research-path-generating-badge">生成中</span>}
      </div>

      <div className="research-path-timeline">
        {PHASES.map((phase, idx) => {
          const status = getPhaseStatus(nodes, phase.id);
          const isActive = idx === currentPhaseIdx;

          return (
            <React.Fragment key={phase.id}>
              <PhaseNode phase={phase} status={status} nodes={nodes} isActive={isActive} />
              {idx < PHASES.length - 1 && (
                <PhaseConnector fromStatus={status} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default ResearchPathView;
