import apiClient from './index';

export type AuthStatusResponse = {
  authEnabled: boolean;
  loggedIn: boolean;
  passwordSet?: boolean;
  passwordChangeable?: boolean;
  setupState: 'enabled' | 'password_retained' | 'no_password';
  currentUser?: {
    username: string;
    role: string;
  };
};

export type UserInfo = {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string | null;
};

export const authApi = {
  async getStatus(): Promise<AuthStatusResponse> {
    const { data } = await apiClient.get<AuthStatusResponse>('/api/v1/auth/status');
    return data;
  },

  async updateSettings(
    authEnabled: boolean,
    password?: string,
    passwordConfirm?: string,
    currentPassword?: string
  ): Promise<AuthStatusResponse> {
    const body: {
      authEnabled: boolean;
      password?: string;
      passwordConfirm?: string;
      currentPassword?: string;
    } = { authEnabled };
    if (password !== undefined) {
      body.password = password;
    }
    if (passwordConfirm !== undefined) {
      body.passwordConfirm = passwordConfirm;
    }
    if (currentPassword !== undefined) {
      body.currentPassword = currentPassword;
    }
    const { data } = await apiClient.post<AuthStatusResponse>('/api/v1/auth/settings', body);
    return data;
  },

  async login(username: string, password: string, passwordConfirm?: string): Promise<void> {
    const body: { username: string; password: string; passwordConfirm?: string } = { username, password };
    if (passwordConfirm !== undefined) {
      body.passwordConfirm = passwordConfirm;
    }
    await apiClient.post('/api/v1/auth/login', body);
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
    newPasswordConfirm: string
  ): Promise<void> {
    await apiClient.post('/api/v1/auth/change-password', {
      currentPassword,
      newPassword,
      newPasswordConfirm,
    });
  },

  async logout(): Promise<void> {
    await apiClient.post('/api/v1/auth/logout');
  },

  async listUsers(): Promise<{ users: UserInfo[] }> {
    const { data } = await apiClient.get<{ users: UserInfo[] }>('/api/v1/auth/users');
    return data;
  },

  async createUser(username: string, password: string, role: string): Promise<void> {
    await apiClient.post('/api/v1/auth/users', { username, password, role });
  },

  async resetUserPassword(username: string, newPassword: string): Promise<void> {
    await apiClient.post('/api/v1/auth/users/reset-password', { username, newPassword });
  },

  async toggleUserActive(username: string, isActive: boolean): Promise<void> {
    await apiClient.post('/api/v1/auth/users/toggle-active', { username, isActive });
  },

  async deleteUser(username: string): Promise<void> {
    await apiClient.post('/api/v1/auth/users/delete', { username });
  },
};
