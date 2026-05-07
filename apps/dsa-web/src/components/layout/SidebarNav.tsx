import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3, BriefcaseBusiness, CandlestickChart, Home, LogOut, MessageSquareQuote, Settings2 } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAgentChatStore } from '../../stores/agentChatStore';
import { cn } from '../../utils/cn';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { StatusDot } from '../common/StatusDot';
import { ThemeToggle } from '../theme/ThemeToggle';

type SidebarNavProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

type NavItem = {
  key: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: 'completion';
};

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: '首页', to: '/', icon: Home, exact: true },
  { key: 'market', label: '行情', to: '/market', icon: CandlestickChart },
  { key: 'chat', label: '问股', to: '/chat', icon: MessageSquareQuote, badge: 'completion' },
  { key: 'portfolio', label: '持仓', to: '/portfolio', icon: BriefcaseBusiness },
  { key: 'backtest', label: '回测', to: '/backtest', icon: BarChart3 },
  { key: 'settings', label: '设置', to: '/settings', icon: Settings2 },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({ collapsed = false, onNavigate }) => {
  const { authEnabled, currentUser, logout } = useAuth();
  const completionBadge = useAgentChatStore((state) => state.completionBadge);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className={cn('mb-5 flex items-center gap-2.5 px-1', collapsed ? 'justify-center' : '')}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-gradient text-[hsl(var(--primary-foreground))] shadow-[0_4px_12px_var(--nav-brand-shadow)]">
          <CandlestickChart className="h-4.5 w-4.5" />
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-foreground">DSA</p>
            <p className="truncate text-[10px] text-muted-text">智能行情分析</p>
          </div>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5" aria-label="主导航">
        {NAV_ITEMS.map(({ key, label, to, icon: Icon, exact, badge }) => (
          <NavLink
            key={key}
            to={to}
            end={exact}
            onClick={onNavigate}
            aria-label={label}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 text-[13px] transition-all',
                'h-9',
                collapsed ? 'justify-center px-0' : 'px-2.5',
                isActive
                  ? 'bg-[var(--nav-active-bg)] text-[hsl(var(--primary))] font-medium'
                  : 'text-secondary-text hover:bg-[var(--nav-hover-bg)] hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div 
                    layoutId="activeIndicator"
                    className="absolute inset-0 rounded-md bg-[var(--nav-active-bg)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
                <Icon className={cn('relative z-10 h-4 w-4 shrink-0', isActive ? 'text-[var(--nav-icon-active)]' : 'text-current')} />
                {!collapsed ? <span className="relative z-10 truncate">{label}</span> : null}
                {badge === 'completion' && completionBadge ? (
                  <StatusDot
                    tone="info"
                    data-testid="chat-completion-badge"
                    className={cn(
                      'absolute right-3 border-2 border-background shadow-[0_0_10px_var(--nav-indicator-shadow)]',
                      collapsed ? 'right-2 top-2' : ''
                    )}
                    aria-label="问股有新消息"
                  />
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-2 mb-1">
        <ThemeToggle variant="nav" collapsed={collapsed} />
      </div>

      {authEnabled ? (
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className={cn(
            'mt-2 flex h-9 w-full cursor-pointer select-none items-center gap-2.5 rounded-md border border-transparent px-2.5 text-[13px] text-secondary-text transition-all hover:bg-[var(--nav-hover-bg)] hover:text-foreground',
            collapsed ? 'justify-center px-0' : ''
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed ? <span>{currentUser ? `${currentUser.username} · 退出` : '退出'}</span> : null}
        </button>
      ) : null}

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
