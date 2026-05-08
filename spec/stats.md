# Statistical Signals

Stats are computed from fact tables, not raw text.

| Signal | Source | Rule |
|---|---|---|
| Task velocity | `task_facts` | created/completed weekly deltas and regression trend |
| Contract health | `contract_facts` | unsigned count, oldest age, completion rate |
| Client silence | `client_activity_facts` | last activity vs historical cadence |
| Deployment cadence | `deployment_facts` and `code_facts` | weekly deploy count and failed deploy ratio |
| Service health | `service_health_facts` | downtime events, recovery durations |
| Email pressure | `email_facts` | inbound volume and thread recurrence |
| Schedule load | `schedule_facts` | work duration by client/project/week |

## Output Requirements

Stats output must include:

- window start/end
- generated timestamp
- source count
- whether minimum sample size is met
- error/fallback state

If samples are too small, Perception says so. No fake trend lines. We are building memory, not astrology.
