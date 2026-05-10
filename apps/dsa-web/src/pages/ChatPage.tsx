import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../utils/cn';
import { agentApi } from '../api/agent';
import { ApiErrorAlert, Button, ConfirmDialog, EmptyState, InlineAlert, ScrollArea, Tooltip } from '../components/common';
import { DashboardStateBlock } from '../components/dashboard';
import {
  useAgentChatStore,
  type Message,
} from '../stores/agentChatStore';
import { downloadSession } from '../utils/chatExport';
import { isNearBottom } from '../utils/chatScroll';
import ResearchPathView from '../components/chat/ResearchPathView';

const QUICK_QUESTIONS = [
  { label: '深度研究贵州茅台', skill: 'deep_research' },
  { label: '深度研究宁德时代', skill: 'deep_research' },
  { label: '深度研究比亚迪', skill: 'deep_research' },
  { label: '深度研究中芯国际', skill: 'deep_research' },
  { label: '深度研究东方财富', skill: 'deep_research' },
  { label: '深度研究招商银行', skill: 'deep_research' },
];

const ChatPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState('');
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendToast, setSendToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [copiedMessages, setCopiedMessages] = useState<Set<string>>(new Set());
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const copyResetTimerRef = useRef<Partial<Record<string, number>>>({});
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const sendToastTimerRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior>('auto');

  useEffect(() => {
    const timers = copyResetTimerRef.current;
    return () => {
      if (sendToastTimerRef.current !== null) {
        window.clearTimeout(sendToastTimerRef.current);
      }
      Object.values(timers).forEach((timerId) => {
        if (timerId !== undefined) {
          window.clearTimeout(timerId);
        }
      });
    };
  }, []);

  useEffect(() => {
    document.title = '问股 - 牛气';
  }, []);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const {
    messages,
    loading,
    progressSteps,
    sessionId,
    sessions,
    sessionsLoading,
    chatError,
    loadSessions,
    loadInitialSession,
    switchSession,
    startStream,
    clearCompletionBadge,
  } = useAgentChatStore();

  const syncScrollState = useCallback(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    const nearBottom = isNearBottom({
      scrollTop: viewport.scrollTop,
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
    });
    shouldStickToBottomRef.current = nearBottom;
    setShowJumpToBottom((prev) => (nearBottom ? false : prev));
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const requestScrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    shouldStickToBottomRef.current = true;
    pendingScrollBehaviorRef.current = behavior;
    setShowJumpToBottom(false);
  }, []);

  const handleMessagesScroll = useCallback(() => {
    syncScrollState();
  }, [syncScrollState]);

  useEffect(() => {
    syncScrollState();
  }, [syncScrollState, sessionId]);

  useEffect(() => {
    const behavior = pendingScrollBehaviorRef.current;
    const shouldAutoScroll = shouldStickToBottomRef.current;
    if (!shouldAutoScroll) {
      if (messages.length > 0 || progressSteps.length > 0 || loading) {
        setShowJumpToBottom(true);
      }
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollToBottom(behavior);
      pendingScrollBehaviorRef.current = loading ? 'auto' : 'smooth';
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, progressSteps, loading, sessionId, scrollToBottom]);

  useEffect(() => {
    if (!loading) {
      pendingScrollBehaviorRef.current = 'smooth';
    }
  }, [loading]);

  useEffect(() => {
    clearCompletionBadge();
  }, [clearCompletionBadge]);

  useEffect(() => {
    loadInitialSession();
  }, [loadInitialSession]);

  const quickQuestions = QUICK_QUESTIONS;

  const handleStartNewChat = useCallback(() => {
    requestScrollToBottom('auto');
    useAgentChatStore.getState().startNewChat();
    setSidebarOpen(false);
  }, [requestScrollToBottom]);

  const handleSwitchSession = useCallback((targetSessionId: string) => {
    requestScrollToBottom('auto');
    switchSession(targetSessionId);
    setSidebarOpen(false);
  }, [requestScrollToBottom, switchSession]);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirmId) return;
    agentApi.deleteChatSession(deleteConfirmId)
      .then(() => {
        loadSessions();
        if (deleteConfirmId === sessionId) {
          handleStartNewChat();
        }
      })
      .catch((error) => {
        console.error('Failed to delete chat session:', error);
      });
    setDeleteConfirmId(null);
  }, [deleteConfirmId, sessionId, loadSessions, handleStartNewChat]);

  useEffect(() => {
    const stockParam = searchParams.get('stock');
    const nameParam = searchParams.get('name');
    if (stockParam) {
      const prompt = nameParam ? `深度研究${nameParam}` : `深度研究${stockParam}`;
      setInput(prompt);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSend = useCallback(
    async (overrideMessage?: string) => {
      const msgText = (overrideMessage ?? input).trim();
      if (!msgText || loading) return;

      const payload = {
        message: msgText,
        session_id: sessionId,
      };

      setInput('');
      requestScrollToBottom('smooth');
      await startStream(payload, {
        skillNames: ['深度研究'],
        skillName: '深度研究',
      });
    },
    [input, loading, requestScrollToBottom, sessionId, startStream],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickQuestion = (q: (typeof QUICK_QUESTIONS)[0]) => {
    handleSend(q.label);
  };

  const showSendFeedback = useCallback((nextToast: { type: 'success' | 'error'; message: string }, durationMs: number) => {
    if (sendToastTimerRef.current !== null) {
      window.clearTimeout(sendToastTimerRef.current);
    }
    setSendToast(nextToast);
    sendToastTimerRef.current = window.setTimeout(() => {
      setSendToast(null);
      sendToastTimerRef.current = null;
    }, durationMs);
  }, []);

  const toggleThinking = (msgId: string) => {
    setExpandedThinking((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const copyMessageToClipboard = async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessages((prev) => new Set(prev).add(msgId));
      const existingTimer = copyResetTimerRef.current[msgId];
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }
      copyResetTimerRef.current[msgId] = window.setTimeout(() => {
        setCopiedMessages((prev) => {
          const next = new Set(prev);
          next.delete(msgId);
          return next;
        });
        delete copyResetTimerRef.current[msgId];
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const downloadMessageAsMarkdown = useCallback((msg: Message) => {
    const heading = msg.role === 'user' ? '# 用户消息' : '# AI 回复';
    const content = [heading, '', msg.content].join('\n');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${msg.role === 'user' ? 'user' : 'assistant'}-message-${msg.id}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, []);

  const renderThinkingBlock = (msg: Message) => {
    if (!msg.thinkingSteps || msg.thinkingSteps.length === 0) return null;
    const isExpanded = expandedThinking.has(msg.id);
    const toolSteps = msg.thinkingSteps.filter((s) => s.type === 'tool_done');
    const totalDuration = toolSteps.reduce(
      (sum, s) => sum + (s.duration || 0),
      0,
    );
    const summary = `${toolSteps.length} 工具 · ${totalDuration.toFixed(1)}s`;

    return (
      <div className="mb-1.5">
        <button
          onClick={() => toggleThinking(msg.id)}
          className="flex items-center gap-1.5 text-[11px] font-mono text-muted-text hover:text-secondary-text transition-colors w-full text-left"
        >
          <svg
            className={`w-3 h-3 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <span className="opacity-60">[研究路径]</span>
          <span className="opacity-40">{summary}</span>
        </button>
        {isExpanded && (
          <div className="mt-1 animate-fade-in">
            <ResearchPathView steps={msg.thinkingSteps} />
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-[11px] font-mono font-semibold text-muted-text uppercase tracking-wider">
          会话
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleStartNewChat}
            className="rounded-sm p-1 text-muted-text transition-colors hover:bg-hover hover:text-foreground"
            aria-label="开启新对话"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="hidden md:flex rounded-sm p-1 text-muted-text transition-colors hover:bg-hover hover:text-foreground"
            aria-label="收起侧栏"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        </div>
      </div>
      <ScrollArea testId="chat-session-list-scroll" viewportClassName="p-1.5">
        {sessionsLoading ? (
          <DashboardStateBlock
            loading
            compact
            title="加载中..."
            className="rounded-sm border border-dashed border-border/50 bg-surface/30"
          />
        ) : sessions.length === 0 ? (
          <DashboardStateBlock
            compact
            title="暂无会话"
            description="提问后记录将显示于此"
            className="rounded-sm border border-dashed border-border/50 bg-surface/30"
          />
        ) : (
          <div className="space-y-px">
            {sessions.map((s) => (
              <div key={s.session_id} className="session-item-row">
                <button
                  type="button"
                  onClick={() => handleSwitchSession(s.session_id)}
                  className={`session-item ${s.session_id === sessionId ? 'active' : ''}`}
                  aria-label={`切换到对话 ${s.title}`}
                  aria-current={s.session_id === sessionId ? 'page' : undefined}
                >
                  <div className="indicator" />
                  <div className="content">
                    <span className="title">{s.title}</span>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="meta">
                        {s.message_count}条
                      </span>
                      {s.last_active && (
                        <>
                          <span className="separator" />
                          <span className="meta font-mono">
                            {new Date(s.last_active).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="delete-btn"
                  onClick={() => {
                    setDeleteConfirmId(s.session_id);
                  }}
                  aria-label={`删除对话 ${s.title}`}
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );

  return (
    <div
      data-testid="chat-workspace"
      className="flex h-full w-full min-w-0 overflow-hidden"
    >
      {!sidebarCollapsed && (
        <div className="hidden h-full w-[200px] flex-shrink-0 flex-col overflow-hidden border-r border-border bg-card md:flex">
          {sidebarContent}
        </div>
      )}

      {sidebarCollapsed && (
        <div className="hidden md:flex flex-col items-center w-8 flex-shrink-0 border-r border-border bg-card py-2">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="rounded-sm p-1 text-muted-text transition-colors hover:bg-hover hover:text-foreground"
            aria-label="展开侧栏"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 5l7 7-7 7M5 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      )}

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute left-0 top-0 bottom-0 w-[200px] flex flex-col overflow-hidden border-r border-border bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteConfirmId)}
        title="删除对话"
        message="删除后，该对话将不可恢复，确认删除吗？"
        confirmText="删除"
        cancelText="取消"
        isDanger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex-shrink-0 flex items-center justify-between border-b border-border px-3 py-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1 rounded-sm hover:bg-hover transition-colors text-secondary-text hover:text-foreground"
              aria-label="历史对话"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <span className="text-xs font-mono font-semibold text-foreground tracking-wider">
              问股终端
            </span>
            <span className="text-[10px] font-mono text-muted-text">
              深度研究
            </span>
          </div>
          {messages.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Tooltip content="导出会话为 Markdown 文件">
                <span className="inline-flex">
                  <Button
                    variant="action-primary"
                    size="sm"
                    onClick={() => downloadSession(messages)}
                    aria-label="导出会话为 Markdown 文件"
                    className="text-[11px] font-mono px-2 py-0.5 rounded-sm"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    导出
                  </Button>
                </span>
              </Tooltip>
              <Tooltip content="发送到已配置的通知机器人/邮箱">
                <span className="inline-flex">
                  <Button
                    variant="action-primary"
                    size="sm"
                    disabled={sending}
                    onClick={async () => {
                      if (sending) return;
                      setSending(true);
                      setSendToast(null);
                      try {
                        const content = messages.map(m => m.content).join('\n\n');
                        await agentApi.sendChat(content);
                        showSendFeedback({ type: 'success', message: '已发送到通知渠道' }, 3000);
                      } catch (err) {
                        showSendFeedback({
                          type: 'error',
                          message: err instanceof Error ? err.message : '发送失败',
                        }, 5000);
                      } finally {
                        setSending(false);
                      }
                    }}
                    aria-label="发送到已配置的通知机器人/邮箱"
                    className="text-[11px] font-mono px-2 py-0.5 rounded-sm"
                  >
                    {sending ? (
                      <svg
                        className="w-3 h-3 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    )}
                    发送
                  </Button>
                </span>
              </Tooltip>
            </div>
          )}
          {sendToast ? (
            <InlineAlert
              variant={sendToast.type === 'success' ? 'success' : 'danger'}
              title={sendToast.type === 'success' ? '发送成功' : '发送失败'}
              message={sendToast.message}
              className="max-w-md rounded-sm px-2 py-1 text-[11px] shadow-none"
            />
          ) : null}
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border bg-background">
          <ScrollArea
            className="relative z-10 flex-1"
            viewportRef={messagesViewportRef}
            onScroll={handleMessagesScroll}
            viewportClassName="space-y-0 p-3"
            testId="chat-message-scroll"
          >
            {messages.length === 0 && !loading ? (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  title="深度研究终端"
                  description="输入股票代码或名称，AI 将通过多轮搜索+反复思考生成深度研究报告"
                  className="max-w-2xl border-dashed bg-card/55"
                  icon={(
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  )}
                  action={(
                    <div className="flex max-w-lg flex-wrap justify-center gap-1.5">
                      {quickQuestions.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleQuickQuestion(q)}
                          className="quick-question-btn"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>
            ) : (
              messages.map((msg) => {
                return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-2 py-1.5',
                    msg.role === 'user' ? 'flex-row-reverse' : ''
                  )}
                >
                  <div
                    className={cn(
                      'flex-shrink-0 text-[10px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-sm',
                      msg.role === 'user'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-elevated text-muted-text'
                    )}
                  >
                    {msg.role === 'user' ? '你' : 'AI'}
                  </div>
                  <div
                    className={cn(
                      'group/message min-w-0 w-fit max-w-[min(100%,56rem)] overflow-hidden px-3 py-2',
                      msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'
                    )}
                  >
                    {msg.role === 'assistant' && renderThinkingBlock(msg)}
                    {msg.role === 'assistant' ? (
                      <div className="relative">
                        <div className="chat-message-actions">
                          <button
                            type="button"
                            onClick={() => copyMessageToClipboard(msg.id, msg.content)}
                            className="chat-copy-btn"
                            aria-label={copiedMessages.has(msg.id) ? '已复制' : '复制'}
                          >
                            {copiedMessages.has(msg.id) ? '已复制' : '复制'}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadMessageAsMarkdown(msg)}
                            className="chat-copy-btn"
                            aria-label="导出此条消息为 Markdown"
                          >
                            导出
                          </button>
                        </div>
                        <div className="chat-prose pr-16 sm:pr-20">
                          <Markdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </Markdown>
                        </div>
                      </div>
                    ) : (
                      msg.content
                        .split('\n')
                        .map((line, i) => (
                          <p
                            key={i}
                            className="mb-0.5 last:mb-0 leading-relaxed text-sm"
                          >
                            {line || '\u00A0'}
                          </p>
                        ))
                    )}
                  </div>
                </div>
                );
              })
            )}

            {loading && (
              <div className="flex gap-2 py-1.5">
                <div className="flex-shrink-0 text-[10px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-elevated text-muted-text">
                  AI
                </div>
                <div className="min-w-[280px] max-w-[min(100%,48rem)] overflow-hidden rounded-sm border border-border bg-card px-3 py-2">
                  <ResearchPathView
                    steps={progressSteps}
                    isGenerating={progressSteps.some((s) => s.type === 'generating')}
                  />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </ScrollArea>

          {showJumpToBottom && (
            <div className="pointer-events-none absolute bottom-[4.5rem] right-3 z-20">
              <button
                type="button"
                className="pointer-events-auto chat-copy-btn"
                onClick={() => {
                  requestScrollToBottom('smooth');
                  scrollToBottom('smooth');
                }}
                aria-label="查看最新消息"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
                新消息
              </button>
            </div>
          )}

          <div className="border-t border-border bg-card p-3 relative z-20">
            <div className="space-y-2">
              {chatError ? <ApiErrorAlert error={chatError} /> : null}

              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入股票代码，开始深度研究... (Enter 发送)"
                  disabled={loading}
                  rows={1}
                  className="flex-1 min-h-[36px] max-h-[160px] rounded-sm border border-border bg-elevated px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-text transition-colors focus:outline-none focus:border-primary/50 resize-none disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                    const t = e.target as HTMLTextAreaElement;
                    t.style.height = 'auto';
                    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
                  }}
                />
                <Button
                  variant="primary"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  isLoading={loading}
                  className="flex-shrink-0 rounded-sm px-3 py-1.5 text-xs font-mono"
                >
                  发送
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
