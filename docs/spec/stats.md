# Statistical Signals

Stats are computed from `dynamic_facts` guided by `provider_schemas` field role hints. No provider-specific table names or column names appear in stat logic. The stats engine understands `role` values (`status`, `date`, `id`, `count`, etc.), not provider names.

## Signal Types

| Signal | How derived |
|---|---|
| **Entity velocity** | Events per entity_type per window — created vs completed/closed, weekly delta and trend |
| **Status health** | Distribution of `role = "status"` values per provider_type — open/closed/failed ratios |
| **Actor activity** | Event counts per actor, silence detection against historical cadence |
| **Deployment cadence** | Weekly counts of events where entity_type = "deployment", failed ratio |
| **Service health** | Downtime events and recovery durations where entity_type = "service" |
| **Communication pressure** | Inbound volume and thread recurrence where entity_type = "email" |
| **Schedule load** | Duration sums from `role = "count"` fields where entity_type = "schedule" |

Signals are derived from entity_type and field roles, not from provider names. A new provider whose events have `entity_type = "deployment"` contributes to deployment cadence automatically.

## Query pattern

Stats queries use `json_extract()` on `dynamic_facts.facts_json` with key names sourced from `provider_schemas.field_mappings_json`. The stats engine never hardcodes a key name — it resolves keys by role at query time.

Example: to find all "status" values for a given provider:

```sql
SELECT json_extract(df.facts_json, '$.' || fm.target_key) AS status_value, COUNT(*) AS cnt
FROM dynamic_facts df
JOIN events e ON e.id = df.event_id
JOIN provider_schemas ps ON ps.provider_type = df.provider_type
  AND (ps.event_type_pattern = e.event_type OR ps.event_type_pattern IS NULL)
  AND ps.confirmed_at IS NOT NULL,
  json_each(ps.field_mappings_json) AS fm
WHERE json_extract(fm.value, '$.role') = 'status'
  AND e.occurred_at >= ?
GROUP BY status_value;
```

## Output Requirements

Every stats output must include:

- window start/end
- generated timestamp
- source count
- whether minimum sample size is met
- error/fallback state

If samples are too small, Perception says so. No fake trend lines. We are building memory, not astrology.

## Stats and unconfirmed schemas

Stats only use events where `quality = "complete"`. Events with `quality = "partial"` or `"degraded"` are excluded from stat computation until their schema is confirmed. This prevents inferred-but-wrong field roles from corrupting signals.
