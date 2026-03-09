const BASE = '/api';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  channels: {
    list: () => req<any[]>('GET', '/channels'),
    create: (data: any) => req<any>('POST', '/channels', data),
    update: (id: number, data: any) => req<any>('PUT', `/channels/${id}`, data),
    delete: (id: number) => req<any>('DELETE', `/channels/${id}`),
    summary: (id: number) => req<any | null>('GET', `/channels/${id}/summary`),
    allSummaries: () => req<any[]>('GET', '/channels/summaries/all'),
    poll: (id: number) => req<any>('POST', `/channels/${id}/poll`),
  },
  tasks: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return req<any[]>('GET', `/tasks${qs}`);
    },
    stats: () => req<any>('GET', '/tasks/stats'),
    links: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return req<any[]>('GET', `/tasks/links/all${qs}`);
    },
    create: (data: any) => req<any>('POST', '/tasks', data),
    update: (id: number, data: any) => req<any>('PUT', `/tasks/${id}`, data),
    updateLink: (id: number, data: any) => req<any>('PUT', `/tasks/links/${id}`, data),
    delete: (id: number) => req<any>('DELETE', `/tasks/${id}`),
    deleteLink: (id: number) => req<any>('DELETE', `/tasks/links/${id}`),
    saveLink: (id: number) => req<any>('POST', `/tasks/links/${id}/save`),
    knowledgeGraph: () => req<{ nodes: any[]; edges: any[] }>('GET', '/tasks/links/graph'),
    bulk: (ids: number[], action: string, status?: string) =>
      req<any>('POST', '/tasks/bulk', { ids, action, status }),
    getUpdates: (id: number) => req<any[]>('GET', `/tasks/${id}/updates`),
    addUpdate: (id: number, data: { content: string; author?: string; update_type?: string }) =>
      req<any>('POST', `/tasks/${id}/updates`, data),
    deleteUpdate: (updateId: number) => req<any>('DELETE', `/tasks/updates/${updateId}`),
  },
  templates: {
    list: () => req<any[]>('GET', '/templates'),
    get: (id: number) => req<any>('GET', `/templates/${id}`),
    create: (data: any) => req<any>('POST', '/templates', data),
    update: (id: number, data: any) => req<any>('PUT', `/templates/${id}`, data),
    delete: (id: number) => req<any>('DELETE', `/templates/${id}`),
    push: (id: number, data: any) => req<any>('POST', `/templates/${id}/push`, data),
  },
  rules: {
    list: () => req<any[]>('GET', '/rules'),
    create: (data: any) => req<any>('POST', '/rules', data),
    update: (id: number, data: any) => req<any>('PUT', `/rules/${id}`, data),
    delete: (id: number) => req<any>('DELETE', `/rules/${id}`),
  },
  digest: {
    push: (message: string, channelIds: string[]) => req<any>('POST', '/digest/push', { message, channel_ids: channelIds }),
    generate: (slackChannelId: string) => req<{ digest: string }>('POST', '/digest/generate', { slack_channel_id: slackChannelId }),
    send: (slackChannelId: string) => req<any>('POST', '/digest/send', { slack_channel_id: slackChannelId }),
    poll: () => req<any>('POST', '/digest/poll'),
  },
  slackChannels: {
    list: () => req<Array<{ id: string; name: string }>>('GET', '/slack-channels'),
  },
  settings: {
    get: () => req<{ schema: any[]; values: Record<string, string>; envPath: string }>('GET', '/settings'),
    save: (values: Record<string, string>) => req<{ success: boolean; envPath: string }>('POST', '/settings', values),
  },
  mentions: {
    list: (params?: { is_read?: number; slack_channel_id?: string }) => {
      const qs = params ? '?' + new URLSearchParams(
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
      ).toString() : '';
      return req<any[]>('GET', `/mentions${qs}`);
    },
    unreadCount: () => req<{ count: number }>('GET', '/mentions/unread-count'),
    markRead: (id: number) => req<any>('PUT', `/mentions/${id}`, { is_read: 1 }),
    markAllRead: () => req<any>('POST', '/mentions/read-all'),
    delete: (id: number) => req<any>('DELETE', `/mentions/${id}`),
  },
};
