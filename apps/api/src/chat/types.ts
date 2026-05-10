export type ChatRequest = { session_id?: string; message: string };

export type ChatSource = {
  event_id: string;
  provider_name: string;
  occurred_at: string;
  title: string;
  score: number;
};

export type ChatMessageRecord = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: ChatSource[];
  feedback: 'up' | 'down' | null;
  created_at: string;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  preview: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

export type ChatSessionDetail = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessageRecord[];
};
