import type { EventRow } from '$lib/api';

export const eventsState = $state({
  events: [] as EventRow[],
  total: 0,
  loading: false,
  query: '',
  providerFilter: '',
  qualityFilter: '',
});
