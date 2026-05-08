# Open Questions

- Should Perception run as a separate service, or eventually be embedded as a Nook module?
- Should raw payload storage ever be allowed in production, or only local debug?
- Does Facile want email body excerpts indexed, or only headers and subject lines?
- Should `charles` become the canonical client entity source for every provider, or should Perception maintain its own entity resolver?
- Is Turso Cloud the target, or local libSQL on la ruche with file backups?

## Recommended Defaults

- Separate service.
- No raw payloads in production.
- IMAP headers only for v1.
- Use Charles IDs when available, but keep a local entity resolver.
- Start local libSQL for MVP; move to Turso Cloud only when remote sync/branching is useful.
