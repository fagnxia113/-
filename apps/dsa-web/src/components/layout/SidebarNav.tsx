import React, { useState } from 'react';
import { BarChart3, BriefcaseBusiness, CandlestickChart, Home, LogOut, MessageSquareQuote, PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAgentChatStore } from '../../stores/agentChatStore';
import { cn } from '../../utils/cn';
import { ConfirmDialog } from '../common/ConfirmDialog';

type SidebarNavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
};

type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: 'completion';
  shortcut?: string;
};

const MAIN_NAV: NavItem[] = [
  { key: 'home', label: '首页', to: '/', icon: Home, exact: true, shortcut: '⌘1' },
  { key: 'market', label: '行情', to: '/market', icon: CandlestickChart, shortcut: '⌘2' },
  { key: 'chat', label: '深度研究', to: '/chat', icon: MessageSquareQuote, badge: 'completion', shortcut: '⌘3' },
  { key: 'portfolio', label: '持仓', to: '/portfolio', icon: BriefcaseBusiness, shortcut: '⌘4' },
  { key: 'backtest', label: '回测', to: '/backtest', icon: BarChart3, shortcut: '⌘5' },
];

const BOTTOM_NAV: NavItem[] = [
  { key: 'settings', label: '设置', to: '/settings', icon: Settings2, shortcut: '⌘,' },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({ collapsed = false, onNavigate, onToggleCollapse }) => {
  const { authEnabled, currentUser, logout } = useAuth();
  const completionBadge = useAgentChatStore((state) => state.completionBadge);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  return (
    <div className="flex h-full flex-col py-2">
      <div className={cn('flex items-center h-8 shrink-0', collapsed ? 'justify-center' : 'px-3')}>
        {collapsed ? (
          <span className="text-[11px] font-bold tracking-wider text-foreground font-mono">牛气</span>
        ) : (
          <span className="text-[11px] font-bold tracking-wider text-foreground font-mono">
            牛气 <span className="text-muted-text font-normal">终端</span>
          </span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-px px-1.5 mt-1" aria-label="主导航">
        {MAIN_NAV.map(({ key, label, to, icon: Icon, exact, badge, shortcut }) => (
          <NavLink
            key={key}
            to={to}
            end={exact}
            onClick={onNavigate}
            aria-label={label}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2 text-[13px] transition-colors rounded-sm',
                'h-9',
                collapsed ? 'justify-center' : 'px-2',
                isActive
                  ? 'bg-[var(--nav-active-bg)] text-[hsl(var(--primary))] font-medium'
                  : 'text-secondary-text hover:bg-[var(--nav-hover-bg)] hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-[var(--nav-icon-active)]' : 'text-current')} />
                {!collapsed && (
                  <>
                    <span className="truncate flex-1">{label}</span>
                    {shortcut && (
                      <span className="text-[10px] text-muted-text/50 font-mono ml-auto">{shortcut}</span>
                    )}
                  </>
                )}
                {badge === 'completion' && completionBadge && (
                  <span
                    className={cn(
                      'rounded-full bg-primary',
                      collapsed ? 'absolute top-1 right-1 h-1.5 w-1.5' : 'h-1.5 w-1.5 shrink-0'
                    )}
                    data-testid="chat-completion-badge"
                    aria-label="问股有新消息"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mx-2 my-1 border-t border-border" />

      <div className="flex flex-col gap-px px-1.5">
        {BOTTOM_NAV.map(({ key, label, to, icon: Icon, exact, shortcut }) => (
          <NavLink
            key={key}
            to={to}
            end={exact}
            onClick={onNavigate}
            aria-label={label}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2 text-[13px] transition-colors rounded-sm',
                'h-9',
                collapsed ? 'justify-center' : 'px-2',
                isActive
                  ? 'bg-[var(--nav-active-bg)] text-[hsl(var(--primary))] font-medium'
                  : 'text-secondary-text hover:bg-[var(--nav-hover-bg)] hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-[var(--nav-icon-active)]' : 'text-current')} />
                {!collapsed && (
                  <>
                    <span className="truncate flex-1">{label}</span>
                    {shortcut && (
                      <span className="text-[10px] text-muted-text/50 font-mono ml-auto">{shortcut}</span>
                    )}
                  </>
                )}
              </>
            )}
          </NavLink>
        ))}

        {authEnabled && (
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className={cn(
              'flex h-9 w-full cursor-pointer select-none items-center gap-2 rounded-sm text-[13px] text-secondary-text transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-foreground',
              collapsed ? 'justify-center' : 'px-2'
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate text-[12px]">{currentUser ? `${currentUser.username} 退出` : '退出'}</span>}
          </button>
        )}
      </div>

      {onToggleCollapse && (
        <div className="mt-auto px-1.5 pt-1">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex h-7 w-full items-center justify-center rounded-sm text-secondary-text transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-foreground"
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="退出登录"
        message="确认退出当前登录状态吗？退出后需要重新输入密码。"
        confirmText="确认退出"
        cancelText="取消"
        isDanger
        onConfirm={() => {
          setShowLogoutConfirm(false);
          onNavigate?.();
          void logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
};
