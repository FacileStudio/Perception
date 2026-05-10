import { api } from '$lib/api';

class NotificationStore {
  unreadCount = $state(0);

  async refresh() {
    try {
      const { count } = await api.notifications.unreadCount();
      this.unreadCount = count;
    } catch {
      // silent
    }
  }
}

export const notifications = new NotificationStore();
