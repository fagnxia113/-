import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Trash2, KeyRound, ToggleLeft, ToggleRight, Users } from 'lucide-react';
import { authApi, type UserInfo } from '../../api/auth';
import { getParsedApiError, type ParsedApiError } from '../../api/error';
import { useAuth } from '../../hooks';
import { Badge, Button, ConfirmDialog, Input } from '../common';
import { SettingsAlert } from './SettingsAlert';
import { SettingsSectionCard } from './SettingsSectionCard';

export const UserManagementCard: React.FC = () => {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<ParsedApiError | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [isCreating, setIsCreating] = useState(false);

  const [resetTarget, setResetTarget] = useState<UserInfo | null>(null);
  const [resetNewPwd, setResetNewPwd] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserInfo | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const result = await authApi.listUsers();
      setUsers(result.users);
    } catch (err) {
      setLoadError(getParsedApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
    }
  }, [isAdmin, loadUsers]);

  useEffect(() => {
    if (!actionSuccess) return;
    const timer = window.setTimeout(() => setActionSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [actionSuccess]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!newUsername.trim() || !newPassword.trim()) {
      setActionError('用户名和密码不能为空');
      return;
    }
    setIsCreating(true);
    try {
      await authApi.createUser(newUsername.trim(), newPassword.trim(), newRole);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      setActionSuccess(`用户 ${newUsername.trim()} 创建成功`);
      await loadUsers();
    } catch (err) {
      setActionError(getParsedApiError(err).message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !resetNewPwd.trim()) return;
    setActionError(null);
    setIsResetting(true);
    try {
      await authApi.resetUserPassword(resetTarget.username, resetNewPwd.trim());
      setActionSuccess(`用户 ${resetTarget.username} 密码已重置`);
      setResetTarget(null);
      setResetNewPwd('');
    } catch (err) {
      setActionError(getParsedApiError(err).message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleToggleActive = async (user: UserInfo) => {
    setActionError(null);
    try {
      await authApi.toggleUserActive(user.username, !user.isActive);
      setActionSuccess(`用户 ${user.username} 已${user.isActive ? '禁用' : '启用'}`);
      await loadUsers();
    } catch (err) {
      setActionError(getParsedApiError(err).message);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setActionError(null);
    try {
      await authApi.deleteUser(deleteTarget.username);
      setActionSuccess(`用户 ${deleteTarget.username} 已删除`);
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      setActionError(getParsedApiError(err).message);
    }
  };

  if (!isAdmin) return null;

  return (
    <SettingsSectionCard
      title="用户管理"
      description="管理系统用户账户，包括创建、禁用、重置密码和删除操作。仅管理员可见。"
      actions={
        <Badge variant="default" size="sm">
          <Users className="mr-1 h-3 w-3" />
          {users.length} 位用户
        </Badge>
      }
    >
      {loadError ? (
        <SettingsAlert
          title="加载用户列表失败"
          message={loadError.message}
          variant="error"
          actionLabel="重试"
          onAction={() => void loadUsers()}
        />
      ) : null}

      {actionError ? (
        <SettingsAlert title="操作失败" message={actionError} variant="error" />
      ) : null}
      {actionSuccess ? (
        <SettingsAlert title="操作成功" message={actionSuccess} variant="success" />
      ) : null}

      <form onSubmit={handleCreateUser} className="space-y-4">
        <div className="rounded-md border border-[var(--settings-border)] bg-[var(--settings-surface)] p-4 shadow-soft-card">
          <p className="mb-3 text-sm font-semibold text-foreground">创建新用户</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Input
              label="用户名"
              placeholder="输入用户名"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              disabled={isCreating}
              autoComplete="off"
            />
            <Input
              label="密码"
              type="password"
              allowTogglePassword
              iconType="password"
              placeholder="至少 6 位"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isCreating}
              autoComplete="new-password"
            />
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-text">角色</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                disabled={isCreating}
                className="h-[var(--input-height,40px)] w-full rounded-md border border-[var(--settings-border)] bg-[var(--settings-surface-hover)] px-3 text-sm text-foreground outline-none transition-[border-color,background-color] hover:border-[var(--settings-border-strong)] focus:border-[hsl(var(--primary))]"
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                variant="settings-primary"
                isLoading={isCreating}
                disabled={!newUsername.trim() || !newPassword.trim()}
                className="w-full"
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                创建用户
              </Button>
            </div>
          </div>
        </div>
      </form>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan/20 border-t-cyan" />
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-3 rounded-md border border-[var(--settings-border)] bg-[var(--settings-surface)] p-4 shadow-soft-card transition-[background-color,border-color] hover:border-[var(--settings-border-strong)] hover:bg-[var(--settings-surface-hover)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                  user.role === 'admin'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                }`}>
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{user.username}</span>
                    <Badge
                      variant={user.role === 'admin' ? 'warning' : 'default'}
                      size="sm"
                    >
                      {user.role === 'admin' ? '管理员' : '用户'}
                    </Badge>
                    {!user.isActive ? (
                      <Badge variant="danger" size="sm">已禁用</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-text">
                    {user.createdAt ? `创建于 ${new Date(user.createdAt).toLocaleString('zh-CN')}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="settings-secondary"
                  size="sm"
                  onClick={() => handleToggleActive(user)}
                  disabled={user.username === currentUser?.username}
                  title={user.isActive ? '禁用用户' : '启用用户'}
                >
                  {user.isActive ? (
                    <><ToggleRight className="mr-1 h-3.5 w-3.5 text-emerald-500" /> 启用中</>
                  ) : (
                    <><ToggleLeft className="mr-1 h-3.5 w-3.5 text-red-400" /> 已禁用</>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="settings-secondary"
                  size="sm"
                  onClick={() => { setResetTarget(user); setResetNewPwd(''); }}
                  title="重置密码"
                >
                  <KeyRound className="mr-1 h-3.5 w-3.5" />
                  重置密码
                </Button>
                <Button
                  type="button"
                  variant="settings-secondary"
                  size="sm"
                  onClick={() => setDeleteTarget(user)}
                  disabled={user.username === currentUser?.username}
                  title="删除用户"
                  className="!text-red-500 hover:!text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {users.length === 0 && !loadError ? (
            <p className="py-6 text-center text-sm text-muted-text">暂无用户数据</p>
          ) : null}
        </div>
      )}

      {resetTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setResetTarget(null); setResetNewPwd(''); }}>
          <div className="w-full max-w-md rounded-lg border border-[var(--settings-border)] bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground">重置 {resetTarget.username} 的密码</h3>
            <p className="mt-2 text-sm text-muted-text">请输入新密码，重置后该用户需使用新密码登录。</p>
            <div className="mt-4">
              <Input
                label="新密码"
                type="password"
                allowTogglePassword
                iconType="password"
                placeholder="输入新密码（至少 6 位）"
                value={resetNewPwd}
                onChange={(e) => setResetNewPwd(e.target.value)}
                disabled={isResetting}
                autoComplete="new-password"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="settings-secondary"
                onClick={() => { setResetTarget(null); setResetNewPwd(''); }}
                disabled={isResetting}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="settings-primary"
                isLoading={isResetting}
                disabled={!resetNewPwd.trim()}
                onClick={() => void handleResetPassword()}
              >
                确认重置
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={`删除用户 ${deleteTarget?.username ?? ''}`}
        message={`确认删除用户「${deleteTarget?.username ?? ''}」？此操作不可撤销，该用户的所有会话将立即失效。`}
        confirmText="确认删除"
        cancelText="取消"
        isDanger
        onConfirm={() => void handleDeleteUser()}
        onCancel={() => setDeleteTarget(null)}
      />
    </SettingsSectionCard>
  );
};
