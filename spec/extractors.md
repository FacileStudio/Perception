# Provider Extraction Contract

Perception must never depend only on LLM extraction for core fields. Each provider gets a deterministic extractor that produces:

```ts
type ExtractedEvent = {
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  actor_name: string | null;
  actor_email: string | null;
  status: string | null;
  due_at: string | null;
  completed_at: string | null;
  url: string | null;
  title: string;
  summary: string;
  searchable_text: string;
  facts: ProviderFacts;
  quality: "complete" | "partial" | "degraded";
};
```

## Provider Fact Targets

| Provider | Fact table | Important fields |
|---|---|---|
| `vikunja` | `task_facts` | task id, title, status, due date, assignee, project |
| `docuseal` | `contract_facts` | submission id, template, signer, status, completed/declined/opened dates |
| `charles` | `client_activity_facts` | client/contact id, entity type, changed fields, actor |
| `dokploy` | `deployment_facts` | project, app, status, timestamp, build URL |
| `git` | `code_facts` | repo, ref, commit count, SHA, PR/issue id |
| `uptime-kuma` | `service_health_facts` | monitor id/name, up/down status, duration, ping |
| `imap` | `email_facts` | UID/message id, from domain, subject, date, thread id when available |
| `sablier` | `schedule_facts` | entry/session id, started/stopped dates, project/client when available |
| `website` | `service_health_facts` | URL, status, transition, downtime |

Unknown providers still create an `events` row with `quality = "degraded"` and a generic summary, but they do not feed stats until a real extractor exists.
