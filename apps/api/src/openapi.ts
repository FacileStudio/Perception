export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Perception API',
    version: '1.0.0',
    description: `# Perception API

Perception is the **context brain for Facile business operations**. It ingests structured events from Nook (webhooks, emails, CRM updates, etc.), builds a durable knowledge graph of entities and relations, and answers grounded operational questions via a conversational retrieval interface.

## Core capabilities

- **Event ingestion** — HMAC-signed webhook receiver that normalizes, embeds, and indexes business events
- **Entity resolution** — Automatic entity extraction, alias management, merge/split, and fuzzy match review
- **Knowledge graph** — Entities, typed relations, Louvain community detection, and LLM-generated narratives
- **Chat** — Conversational retrieval with query planning, vector + SQL + narrative search, and streamed SSE responses
- **Forecasting** — Bayesian belief tracking, conformal prediction intervals, calibration scoring, and multi-strategy ensembles
- **Proposals** — AI-generated action proposals with approve/dismiss workflow

## Authentication

Perception uses **session cookies** via \`better-auth\`. Two auth methods are supported:

1. **Password login** — POST to \`/auth/login\` with the admin password. The response sets a \`perception_session\` cookie.
2. **OIDC/SSO** — Redirect to \`/auth/oidc\` to initiate an OpenID Connect flow (when configured).

All endpoints except \`/health\`, \`/ready\`, \`/auth/config\`, \`/auth/login\`, \`/auth/oidc\`, and \`/auth/oidc/callback\` require an authenticated session.

### Login example

\`\`\`bash
curl -X POST https://perception.example.com/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"password": "your-admin-password"}' \\
  -c cookies.txt
\`\`\`

## Workspace scoping

Most data endpoints are scoped to the **active workspace**. The active workspace is stored in the user session and can be changed via \`POST /workspaces/switch\`. All queries automatically filter by the active workspace — no manual workspace ID header is needed for authenticated requests.

The **ingest endpoint** is an exception: it uses the \`x-perception-workspace\` header to route events to the correct workspace since ingest calls come from Nook, not from an authenticated browser session.

## Event ingestion with HMAC signing

Events are sent from Nook with HMAC-SHA256 signature verification. The signature covers the raw JSON body using a shared secret.

\`\`\`bash
BODY='{"schemaVersion":1,"id":"evt_abc123","occurredAt":"2026-06-26T10:00:00Z","emittedAt":"2026-06-26T10:00:01Z","source":"webhook","provider":{"id":"prv_1","type":"github","name":"GitHub","tags":[]},"event":{"type":"push","title":"Push to main","messageHtml":null,"messageText":null,"url":null},"actor":{"id":"usr_1","name":"Ada","email":"ada@example.com"},"subject":{"type":"repository","id":"repo_1","name":"perception","url":null},"payload":{"normalized":{},"raw":null},"privacy":{"containsPii":false,"rawPayloadAllowed":true}}'

TIMESTAMP=$(date +%s)
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$NOOK_SECRET" | awk '{print $2}')

curl -X POST https://perception.example.com/ingest \\
  -H 'Content-Type: application/json' \\
  -H "x-perception-workspace: ws_default" \\
  -H "x-nook-event-id: evt_abc123" \\
  -H "x-nook-timestamp: $TIMESTAMP" \\
  -H "x-nook-signature-256: sha256=$SIGNATURE" \\
  -d "$BODY"
\`\`\`

## Chat streaming (SSE)

The chat endpoint returns a Server-Sent Events stream. The \`X-Session-Id\` response header contains the session ID for follow-up messages.

\`\`\`bash
curl -N -X POST https://perception.example.com/chat \\
  -H 'Content-Type: application/json' \\
  -b cookies.txt \\
  -d '{"message": "What happened with the Acme contract last week?"}'
\`\`\`

\`\`\`javascript
const res = await fetch('/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ message: 'Show me recent GitHub activity' }),
});

const sessionId = res.headers.get('X-Session-Id');
const reader = res.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(decoder.decode(value));
}
\`\`\`

## Entity graph query example

\`\`\`bash
curl https://perception.example.com/entities/graph \\
  -b cookies.txt | jq '.entities[:3]'
\`\`\`

## Forecast creation example

\`\`\`bash
curl -X POST https://perception.example.com/forecasts \\
  -H 'Content-Type: application/json' \\
  -b cookies.txt \\
  -d '{
    "question": "Will the Acme deal close by end of Q3?",
    "question_type": "binary",
    "resolution_criteria": "Deal status marked as won in CRM",
    "resolves_at": "2026-09-30T23:59:59Z"
  }'
\`\`\`

## Rate limiting

The \`/auth/login\` endpoint is rate-limited to **10 attempts per 5 minutes** per IP. Other endpoints are not currently rate-limited but may be in the future.
`,
  },
  servers: [{ url: '/', description: 'Current host' }],
  tags: [
    { name: 'Health', description: 'Liveness and readiness probes' },
    { name: 'Auth', description: 'Authentication and session management' },
    { name: 'Ingest', description: 'HMAC-signed event ingestion from Nook' },
    { name: 'Chat', description: 'Conversational retrieval and streaming responses' },
    { name: 'Events', description: 'Browse, inspect, and delete ingested events' },
    { name: 'Entities', description: 'Knowledge graph, entity resolution, communities, and narratives' },
    { name: 'Schemas', description: 'Provider schema inference and review' },
    { name: 'Stats', description: 'Dashboard snapshots and intelligence overview' },
    { name: 'Settings', description: 'Workspace and global settings management' },
    { name: 'Users', description: 'User profile and workspace members' },
    { name: 'Notifications', description: 'Anomaly alerts and notification management' },
    { name: 'Resources', description: 'Document uploads and chunk management' },
    { name: 'Proposals', description: 'AI-generated action proposals' },
    { name: 'Workspaces', description: 'Multi-workspace management' },
    { name: 'Forecasts', description: 'Forecasting, calibration, and belief tracking' },
    { name: 'Admin', description: 'Worker management, embeddings, eval harness' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness check',
        operationId: 'healthCheck',
        description: 'Returns server status, startup errors, and auth configuration state.',
        responses: {
          '200': {
            description: 'Server is alive',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ok'] },
                    startupErrors: { type: 'array', items: { type: 'string' } },
                    auth: { type: 'object', properties: { configured: { type: 'boolean' } } },
                  },
                },
                example: {
                  status: 'ok',
                  startupErrors: [],
                  auth: { configured: true },
                },
              },
            },
          },
        },
      },
    },
    '/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness check',
        operationId: 'readinessCheck',
        description: 'Returns 200 when migrations are complete and the database is reachable.',
        responses: {
          '200': {
            description: 'Ready',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ready: { type: 'boolean' } },
                },
                example: { ready: true },
              },
            },
          },
          '503': {
            description: 'Not ready or database unavailable',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },

    '/auth/config': {
      get: {
        tags: ['Auth'],
        summary: 'Auth configuration',
        operationId: 'getAuthConfig',
        description: 'Returns whether SSO-only mode and OIDC are enabled.',
        responses: {
          '200': {
            description: 'Auth config',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ssoOnly: { type: 'boolean' },
                    oidcEnabled: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Password login',
        operationId: 'login',
        description: 'Authenticate with the admin password. Rate-limited to 10 attempts per 5 minutes.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { password: { type: 'string' } },
                required: ['password'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Login successful' },
          '401': { description: 'Wrong password', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        operationId: 'logout',
        description: 'Destroy the current session.',
        responses: { '200': { description: 'Logged out' } },
      },
    },
    '/auth/status': {
      get: {
        tags: ['Auth'],
        summary: 'Session status',
        operationId: 'getAuthStatus',
        description: 'Returns the current authenticated user or null.',
        responses: {
          '200': {
            description: 'Session info',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: {
                      oneOf: [
                        { $ref: '#/components/schemas/User' },
                        { type: 'null' },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/oidc': {
      get: {
        tags: ['Auth'],
        summary: 'Initiate OIDC login',
        operationId: 'initiateOidc',
        description: 'Redirects to the configured OIDC provider. Only available when OIDC is enabled.',
        responses: {
          '302': { description: 'Redirect to OIDC provider' },
          '503': { description: 'OIDC not configured' },
        },
      },
    },
    '/auth/oidc/callback': {
      get: {
        tags: ['Auth'],
        summary: 'OIDC callback',
        operationId: 'handleOidcCallback',
        description: 'Handles the OIDC provider callback, creates a session, and redirects to the client.',
        responses: { '302': { description: 'Redirect to client app' } },
      },
    },

    '/ingest': {
      post: {
        tags: ['Ingest'],
        summary: 'Ingest event',
        operationId: 'ingestEvent',
        description:
          'Receives an HMAC-SHA256 signed event envelope from Nook. Requires x-perception-workspace, x-nook-event-id, x-nook-timestamp, x-nook-schema-version, and x-nook-signature-256 headers. Unknown providers are accepted at degraded quality — no silent drops.',
        'x-codeSamples': [
          {
            lang: 'bash',
            label: 'cURL with HMAC',
            source: `BODY='{"schemaVersion":1,"id":"evt_abc","occurredAt":"2026-01-01T00:00:00Z","emittedAt":"2026-01-01T00:00:01Z","source":"webhook","provider":{"id":"prv_1","type":"github","name":"GitHub","tags":[]},"event":{"type":"push","title":"Push to main","messageHtml":null,"messageText":null,"url":null},"actor":null,"subject":{"type":"repo","id":"r1","name":"app","url":null},"payload":{"normalized":{},"raw":null},"privacy":{"containsPii":false,"rawPayloadAllowed":true}}'
TIMESTAMP=$(date +%s)
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST /ingest \\
  -H 'Content-Type: application/json' \\
  -H "x-perception-workspace: ws_default" \\
  -H "x-nook-event-id: evt_abc" \\
  -H "x-nook-timestamp: $TIMESTAMP" \\
  -H "x-nook-signature-256: sha256=$SIGNATURE" \\
  -d "$BODY"`,
          },
        ],
        parameters: [
          { name: 'x-perception-workspace', in: 'header', required: true, schema: { type: 'string' }, description: 'Target workspace slug or ID' },
          { name: 'x-nook-event-id', in: 'header', required: true, schema: { type: 'string' }, description: 'Unique event ID for replay protection' },
          { name: 'x-nook-timestamp', in: 'header', required: true, schema: { type: 'string' }, description: 'Unix timestamp of the request' },
          { name: 'x-nook-schema-version', in: 'header', required: false, schema: { type: 'string' }, description: 'Schema version (default: 1)' },
          { name: 'x-nook-signature-256', in: 'header', required: true, schema: { type: 'string' }, description: 'HMAC-SHA256 signature as sha256=<hex>. Supports secret rotation with current + previous keys.' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/NookEventEnvelope' },
            },
          },
        },
        responses: {
          '202': { description: 'Event accepted for processing' },
          '400': { description: 'Missing workspace header or invalid JSON', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '401': { description: 'HMAC signature verification failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/chat': {
      post: {
        tags: ['Chat'],
        summary: 'Send chat message',
        operationId: 'sendChatMessage',
        description:
          'Sends a message and streams an SSE response. Performs query planning, retrieval (vector, SQL, narrative, counterfactual), and LLM generation. The X-Session-Id response header contains the session ID for follow-up messages.',
        'x-codeSamples': [
          {
            lang: 'javascript',
            label: 'Fetch SSE stream',
            source: `const res = await fetch('/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ message: 'What happened last week?' }),
});
const sessionId = res.headers.get('X-Session-Id');
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  process.stdout.write(decoder.decode(value));
}`,
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string', description: 'User message text' },
                  session_id: { type: ['string', 'null'], description: 'Existing session ID for follow-up messages. Omit or null to start a new session.' },
                },
                required: ['message'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SSE stream with X-Session-Id header',
            headers: {
              'X-Session-Id': {
                description: 'The chat session ID. Use this for follow-up messages.',
                schema: { type: 'string' },
              },
            },
            content: {
              'text/event-stream': {
                schema: { type: 'string' },
              },
            },
          },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/chat/sessions': {
      get: {
        tags: ['Chat'],
        summary: 'List chat sessions',
        operationId: 'listChatSessions',
        description: 'Returns session summaries for the current user.',
        responses: {
          '200': {
            description: 'Session list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessions: { type: 'array', items: { $ref: '#/components/schemas/ChatSession' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/chat/sessions/{sessionId}': {
      get: {
        tags: ['Chat'],
        summary: 'Get session detail',
        operationId: 'getChatSession',
        description: 'Returns full message history for a session.',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Session with messages',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatSessionDetail' },
              },
            },
          },
          '404': { description: 'Session not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Chat'],
        summary: 'Delete session',
        operationId: 'deleteChatSession',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Session deleted' },
          '404': { description: 'Session not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/chat/messages/{messageId}/feedback': {
      patch: {
        tags: ['Chat'],
        summary: 'Set message feedback',
        operationId: 'setMessageFeedback',
        description: 'Thumbs-up/down on an assistant message. Used for retrieval eval promotion.',
        parameters: [{ name: 'messageId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  feedback: { type: ['string', 'null'], enum: ['up', 'down', null] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Feedback saved' },
          '400': { description: 'Invalid feedback value or not an assistant message', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Message not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/events': {
      get: {
        tags: ['Events'],
        summary: 'List events',
        operationId: 'listEvents',
        description: 'Paginated event list with filters for query, provider, entity type, quality, and date range.',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Full-text search query' },
          { name: 'provider_type', in: 'query', schema: { type: 'string' }, description: 'Filter by provider type (e.g. github, stripe)' },
          { name: 'entity_type', in: 'query', schema: { type: 'string' }, description: 'Filter by entity type' },
          { name: 'quality', in: 'query', schema: { type: 'string', enum: ['complete', 'partial', 'degraded'] }, description: 'Filter by extraction quality' },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Start of date range (ISO 8601)' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'End of date range (ISO 8601)' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 }, description: 'Page size' },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 }, description: 'Page offset' },
        ],
        responses: {
          '200': {
            description: 'Event list with total count',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    events: { type: 'array', items: { $ref: '#/components/schemas/Event' } },
                    total: { type: 'integer' },
                  },
                },
                example: {
                  events: [
                    {
                      id: 'evt_abc123',
                      provider_type: 'github',
                      provider_name: 'GitHub',
                      event_type: 'push',
                      entity_type: 'repository',
                      entity_name: 'perception',
                      title: 'Push to main',
                      summary: 'Ada pushed 3 commits to main branch',
                      quality: 'complete',
                      occurred_at: '2026-06-25T14:30:00Z',
                      ingested_at: '2026-06-25T14:30:02Z',
                    },
                  ],
                  total: 1,
                },
              },
            },
          },
        },
      },
    },
    '/events/{id}': {
      get: {
        tags: ['Events'],
        summary: 'Get event detail',
        operationId: 'getEvent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Event detail with entities and facts',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Event' },
              },
            },
          },
          '404': { description: 'Event not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Events'],
        summary: 'Delete event',
        operationId: 'deleteEvent',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Event deleted' },
          '404': { description: 'Event not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/entities/graph': {
      get: {
        tags: ['Entities'],
        summary: 'Get entity graph',
        operationId: 'getEntityGraph',
        description: 'Returns top 200 entities and all relations for the knowledge graph visualization.',
        responses: {
          '200': {
            description: 'Entities and relations',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    entities: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          canonical_name: { type: 'string' },
                          type_label: { type: 'string' },
                          confidence: { type: 'number' },
                          event_count: { type: 'integer' },
                        },
                      },
                    },
                    relations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          from_id: { type: 'string' },
                          to_id: { type: 'string' },
                          label: { type: 'string' },
                          confidence: { type: 'number' },
                        },
                      },
                    },
                  },
                },
                example: {
                  entities: [
                    { id: 'ent_1', canonical_name: 'Acme Corp', type_label: 'organization', confidence: 0.95, event_count: 42 },
                    { id: 'ent_2', canonical_name: 'Ada Lovelace', type_label: 'person', confidence: 0.88, event_count: 15 },
                  ],
                  relations: [
                    { from_id: 'ent_2', to_id: 'ent_1', label: 'works_at', confidence: 0.92 },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/entities/communities': {
      get: {
        tags: ['Entities'],
        summary: 'List entity communities',
        operationId: 'listCommunities',
        description: 'Returns Louvain-detected communities with member entities and summaries.',
        responses: {
          '200': {
            description: 'Community list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    communities: { type: 'array', items: { $ref: '#/components/schemas/Community' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/entities/narratives': {
      get: {
        tags: ['Entities'],
        summary: 'List entity narratives',
        operationId: 'listNarratives',
        description: 'Returns LLM-generated operational narratives for entities.',
        responses: {
          '200': {
            description: 'Narrative list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    narratives: { type: 'array', items: { $ref: '#/components/schemas/Narrative' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/entities/match-candidates': {
      get: {
        tags: ['Entities'],
        summary: 'List match candidates',
        operationId: 'listMatchCandidates',
        description: 'List entity match candidates for the review queue. Optionally filter by status.',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] }, description: 'Filter by candidate status' },
        ],
        responses: {
          '200': {
            description: 'Match candidate list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    candidates: { type: 'array', items: { $ref: '#/components/schemas/MatchCandidate' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/entities/match-candidates/generate': {
      post: {
        tags: ['Entities'],
        summary: 'Generate match candidates',
        operationId: 'generateMatchCandidates',
        description: 'Generate new entity match candidates via fuzzy name similarity. Pairs with similarity between 0.5 and 0.85 are flagged for human review.',
        responses: {
          '200': {
            description: 'Number of candidates generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { generated: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    '/entities/match-candidates/{id}/resolve': {
      post: {
        tags: ['Entities'],
        summary: 'Resolve match candidate',
        operationId: 'resolveMatchCandidate',
        description: 'Approve or reject a match candidate. Approving triggers an automatic entity merge.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  decision: { type: 'string', enum: ['approve', 'reject'] },
                },
                required: ['decision'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Candidate resolved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { resolved: { type: 'boolean' } },
                },
              },
            },
          },
          '400': { description: 'Invalid decision or candidate error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/entities/path': {
      get: {
        tags: ['Entities'],
        summary: 'Find shortest path',
        operationId: 'findEntityPath',
        description: 'Find the shortest path between two entities via BFS over the knowledge graph. Returns the path nodes, connecting edges, and the total path confidence (product of edge confidences).',
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string' }, description: 'Source entity ID' },
          { name: 'to', in: 'query', required: true, schema: { type: 'string' }, description: 'Target entity ID' },
        ],
        responses: {
          '200': {
            description: 'Shortest path result, or null if no path exists',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    path: {
                      oneOf: [
                        { $ref: '#/components/schemas/PathResult' },
                        { type: 'null' },
                      ],
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing from or to parameter', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/entities/relations/resolve-all': {
      post: {
        tags: ['Entities'],
        summary: 'Resolve all missing relations',
        operationId: 'resolveAllRelations',
        description: 'Triggers LLM-based relation extraction for entities without relations.',
        responses: {
          '200': {
            description: 'Number of relations created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { created: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    '/entities/{id}/narrative': {
      get: {
        tags: ['Entities'],
        summary: 'Get entity narrative',
        operationId: 'getEntityNarrative',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Narrative or null if not yet generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    narrative: {
                      oneOf: [
                        { $ref: '#/components/schemas/Narrative' },
                        { type: 'null' },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/entities/{id}/community': {
      get: {
        tags: ['Entities'],
        summary: 'Get entity community',
        operationId: 'getEntityCommunity',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Community or null if entity is not in any community',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    community: {
                      oneOf: [
                        { $ref: '#/components/schemas/Community' },
                        { type: 'null' },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/entities/{id}/merge': {
      post: {
        tags: ['Entities'],
        summary: 'Merge entities',
        operationId: 'mergeEntity',
        description: 'Merge the source entity (path ID) into the target entity. All event associations, aliases, relations, and community memberships are transferred to the target. The source entity is deleted.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Source entity ID (will be deleted)' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  targetId: { type: 'string', description: 'Target entity ID (will absorb the source)' },
                },
                required: ['targetId'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Entities merged',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { merged: { type: 'boolean' } },
                },
              },
            },
          },
          '400': { description: 'Merge error (same entity, not found, etc.)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/entities/{id}/split': {
      post: {
        tags: ['Entities'],
        summary: 'Split entity',
        operationId: 'splitEntity',
        description: 'Split an entity by moving specified aliases to a new entity. Event associations matching the moved aliases are reassigned to the new entity.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Entity ID to split from' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  aliasIds: { type: 'array', items: { type: 'string' }, description: 'Alias IDs to move to the new entity' },
                  newName: { type: 'string', description: 'Canonical name for the new entity' },
                },
                required: ['aliasIds', 'newName'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Entity split, new entity created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { newEntityId: { type: 'string' } },
                },
              },
            },
          },
          '400': { description: 'Split error (not found, no aliases, etc.)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/entities/{id}/neighbors': {
      get: {
        tags: ['Entities'],
        summary: 'Get multi-hop neighbors',
        operationId: 'getEntityNeighbors',
        description: 'Returns entities and edges reachable within the specified number of hops (1-3). Capped at 100 nodes.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'hops', in: 'query', schema: { type: 'integer', default: 2, minimum: 1, maximum: 3 }, description: 'Number of hops to traverse (1-3)' },
        ],
        responses: {
          '200': {
            description: 'Neighbor graph',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    nodes: { type: 'array', items: { $ref: '#/components/schemas/GraphNode' } },
                    edges: { type: 'array', items: { $ref: '#/components/schemas/GraphEdge' } },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/schemas': {
      get: {
        tags: ['Schemas'],
        summary: 'List provider schemas',
        operationId: 'listSchemas',
        description: 'Paginated list of inferred and confirmed provider schemas.',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'Schema list with total count',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    schemas: { type: 'array', items: { $ref: '#/components/schemas/ProviderSchema' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/schemas/jobs': {
      get: {
        tags: ['Schemas'],
        summary: 'List schema inference jobs',
        operationId: 'listSchemaJobs',
        responses: { '200': { description: 'Recent inference jobs' } },
      },
    },
    '/schemas/{id}': {
      get: {
        tags: ['Schemas'],
        summary: 'Get schema detail',
        operationId: 'getSchema',
        description: 'Returns full schema with parsed field mappings.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Schema detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProviderSchema' },
              },
            },
          },
          '404': { description: 'Schema not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/schemas/{id}/confirm': {
      post: {
        tags: ['Schemas'],
        summary: 'Confirm schema',
        operationId: 'confirmSchema',
        description: 'Marks a schema as confirmed and upgrades associated events to complete quality.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Schema confirmed' },
          '404': { description: 'Schema not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/schemas/{id}/reject': {
      post: {
        tags: ['Schemas'],
        summary: 'Reject schema',
        operationId: 'rejectSchema',
        description: 'Deletes the inferred schema.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Schema rejected' },
          '404': { description: 'Schema not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/stats': {
      get: {
        tags: ['Stats'],
        summary: 'Get dashboard stats',
        operationId: 'getStats',
        description: 'Returns latest stat snapshots and graph health. Auto-refreshes stale data.',
        parameters: [
          { name: 'refresh', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Pass 1 to force a stats refresh' },
        ],
        responses: {
          '200': {
            description: 'Snapshots and graph health',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    snapshots: { type: 'array', items: { $ref: '#/components/schemas/StatsSnapshot' } },
                    graphHealth: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/stats/intelligence': {
      get: {
        tags: ['Stats'],
        summary: 'Intelligence overview',
        operationId: 'getIntelligence',
        description:
          'Comprehensive view: graph health, memory episodes, change points, drift alerts, entity coverage, provider health, isolated entities.',
        responses: { '200': { description: 'Intelligence dashboard data' } },
      },
    },

    '/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get settings',
        operationId: 'getSettings',
        description: 'Returns current effective settings with sensitive values masked.',
        responses: { '200': { description: 'Settings with source annotations' } },
      },
      put: {
        tags: ['Settings'],
        summary: 'Update settings',
        operationId: 'updateSettings',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: { type: ['string', 'null'] } },
            },
          },
        },
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/settings/usage': {
      get: {
        tags: ['Settings'],
        summary: 'Token usage and costs',
        operationId: 'getTokenUsage',
        description: 'Returns LLM and embedding token usage grouped by model, with estimated USD costs.',
        responses: { '200': { description: 'Usage breakdown' } },
      },
    },

    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Current user',
        operationId: 'getCurrentUser',
        responses: {
          '200': {
            description: 'Current user profile',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List workspace members',
        operationId: 'listUsers',
        responses: {
          '200': {
            description: 'User list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    users: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List notifications',
        operationId: 'listNotifications',
        description: 'Paginated notification list with unread/read/all filter.',
        parameters: [
          { name: 'filter', in: 'query', schema: { type: 'string', enum: ['all', 'unread', 'read'], default: 'all' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'Notification list with total',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    notifications: { type: 'array', items: { $ref: '#/components/schemas/Notification' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'Unread count',
        operationId: 'getUnreadCount',
        responses: {
          '200': {
            description: 'Count of unread notifications',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { count: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark as read',
        operationId: 'markNotificationRead',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Marked as read' } },
      },
    },
    '/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all as read',
        operationId: 'markAllNotificationsRead',
        responses: { '200': { description: 'All marked as read' } },
      },
    },

    '/resources': {
      get: {
        tags: ['Resources'],
        summary: 'List resources',
        operationId: 'listResources',
        description: 'Returns uploaded documents with metadata and processing status.',
        responses: {
          '200': {
            description: 'Resource list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    resources: { type: 'array', items: { $ref: '#/components/schemas/Resource' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Resources'],
        summary: 'Upload resource',
        operationId: 'uploadResource',
        description:
          'Upload documents via multipart form data or base64 JSON. Supports PDF, TXT, Markdown, CSV, JSON. Max 50 MB.',
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
              },
            },
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  filename: { type: 'string' },
                  content: { type: 'string', description: 'Base64-encoded file content' },
                  mime_type: { type: 'string' },
                },
                required: ['filename', 'content', 'mime_type'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Resource IDs created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ids: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          '400': { description: 'Unsupported MIME type or missing file', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/resources/{id}': {
      get: {
        tags: ['Resources'],
        summary: 'Get resource detail',
        operationId: 'getResource',
        description: 'Returns resource metadata and all chunks.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Resource with chunks',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Resource' },
              },
            },
          },
          '404': { description: 'Resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Resources'],
        summary: 'Delete resource',
        operationId: 'deleteResource',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Resource deleted' },
          '404': { description: 'Resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/resources/{id}/file': {
      get: {
        tags: ['Resources'],
        summary: 'Download resource file',
        operationId: 'downloadResourceFile',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'File download',
            content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
          },
          '404': { description: 'File not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/proposals': {
      get: {
        tags: ['Proposals'],
        summary: 'List proposals',
        operationId: 'listProposals',
        description: 'Returns action proposals with optional status filter.',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['proposed', 'approved', 'executed', 'dismissed', 'failed'] } },
        ],
        responses: {
          '200': {
            description: 'Proposal list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    proposals: { type: 'array', items: { $ref: '#/components/schemas/Proposal' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Proposals'],
        summary: 'Create proposal',
        operationId: 'createProposal',
        description: 'Manually create an action proposal. Valid types: create_task, tag_client, annotate_contract.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  action_type: { type: 'string', enum: ['create_task', 'tag_client', 'annotate_contract'] },
                  target_provider: { type: 'string' },
                  target_entity_id: { type: 'string' },
                  target_entity_name: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  payload: { type: 'object' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['action_type', 'target_provider', 'title', 'description'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Proposal created' },
          '400': { description: 'Missing fields or invalid action type', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/proposals/{id}/approve': {
      patch: {
        tags: ['Proposals'],
        summary: 'Approve and execute proposal',
        operationId: 'approveProposal',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Proposal approved and executed' },
          '404': { description: 'Proposal not found or not in proposed state', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/proposals/{id}/dismiss': {
      patch: {
        tags: ['Proposals'],
        summary: 'Dismiss proposal',
        operationId: 'dismissProposal',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Proposal dismissed' },
          '404': { description: 'Proposal not found or not in proposed state', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/workspaces': {
      get: {
        tags: ['Workspaces'],
        summary: 'List workspaces',
        operationId: 'listWorkspaces',
        description: 'Returns all workspaces the current user belongs to.',
        responses: {
          '200': {
            description: 'Workspace list with active ID',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workspaces: { type: 'array', items: { $ref: '#/components/schemas/Workspace' } },
                    activeWorkspaceId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Workspaces'],
        summary: 'Create workspace',
        operationId: 'createWorkspace',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  slug: { type: 'string', description: 'URL-safe slug. Auto-generated from name if omitted.' },
                },
                required: ['name'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Workspace created' },
          '409': { description: 'Slug already taken', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/workspaces/switch': {
      post: {
        tags: ['Workspaces'],
        summary: 'Switch active workspace',
        operationId: 'switchWorkspace',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { workspaceId: { type: 'string' } },
                required: ['workspaceId'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Workspace switched' },
          '403': { description: 'Not a member', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/workspaces/{id}': {
      patch: {
        tags: ['Workspaces'],
        summary: 'Update workspace',
        operationId: 'updateWorkspace',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  slug: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Workspace updated' },
          '403': { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '409': { description: 'Slug already taken', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/workspaces/{id}/settings': {
      get: {
        tags: ['Workspaces'],
        summary: 'Get workspace settings',
        operationId: 'getWorkspaceSettings',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Settings with source annotations' } },
      },
      put: {
        tags: ['Workspaces'],
        summary: 'Update workspace settings',
        operationId: 'updateWorkspaceSettings',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: { type: ['string', 'null'] } },
            },
          },
        },
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/workspaces/{id}/members': {
      get: {
        tags: ['Workspaces'],
        summary: 'List workspace members',
        operationId: 'listWorkspaceMembers',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Member list' } },
      },
    },
    '/workspaces/{id}/invite': {
      post: {
        tags: ['Workspaces'],
        summary: 'Invite user to workspace',
        operationId: 'inviteToWorkspace',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  role: { type: 'string', enum: ['admin', 'member'], default: 'member' },
                },
                required: ['email'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'User invited' },
          '409': { description: 'Already a member', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/workspaces/{id}/members/{memberId}': {
      delete: {
        tags: ['Workspaces'],
        summary: 'Remove member',
        operationId: 'removeMember',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'memberId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Member removed' },
          '403': { description: 'Cannot remove owner', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Member not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/workspaces/{id}/members/{memberId}/role': {
      patch: {
        tags: ['Workspaces'],
        summary: 'Change member role',
        operationId: 'changeMemberRole',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'memberId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { role: { type: 'string', enum: ['admin', 'member'] } },
                required: ['role'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Role updated' },
          '403': { description: 'Only owner can change roles', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/workspaces/{id}/stats': {
      get: {
        tags: ['Workspaces'],
        summary: 'Workspace stats',
        operationId: 'getWorkspaceStats',
        description: 'Quick counts: events, entities, sessions, open forecasts.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Stat counts',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    events: { type: 'integer' },
                    entities: { type: 'integer' },
                    sessions: { type: 'integer' },
                    openForecasts: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/forecasts': {
      get: {
        tags: ['Forecasts'],
        summary: 'List forecasts',
        operationId: 'listForecasts',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'resolved', 'voided'] } },
        ],
        responses: {
          '200': {
            description: 'Forecast list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    forecasts: { type: 'array', items: { $ref: '#/components/schemas/Forecast' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Forecasts'],
        summary: 'Create forecast',
        operationId: 'createForecast',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  question: { type: 'string', description: 'The forecast question' },
                  question_type: { type: 'string', enum: ['binary', 'numeric', 'date'] },
                  resolution_criteria: { type: 'string', description: 'How the forecast will be resolved' },
                  resolves_at: { type: 'string', format: 'date-time', description: 'Deadline for resolution (must be in the future)' },
                },
                required: ['question', 'question_type', 'resolution_criteria', 'resolves_at'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Forecast created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { forecast: { $ref: '#/components/schemas/Forecast' } },
                },
                example: {
                  forecast: {
                    id: 'fc_abc123',
                    question: 'Will the Acme deal close by end of Q3?',
                    question_type: 'binary',
                    resolution_criteria: 'Deal status marked as won in CRM',
                    resolution_source: {},
                    base_rate: null,
                    entity_id: null,
                    entity_name: null,
                    provider_type: null,
                    source_signal: null,
                    created_at: '2026-06-26T10:00:00Z',
                    resolves_at: '2026-09-30T23:59:59Z',
                    resolved_at: null,
                    resolution_value: null,
                    status: 'open',
                  },
                },
              },
            },
          },
          '400': { description: 'Missing fields or invalid type', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/forecasts/calibration': {
      get: {
        tags: ['Forecasts'],
        summary: 'Latest calibration snapshot',
        operationId: 'getCalibration',
        description: 'Returns Brier score, reliability, resolution, sharpness, and bin data.',
        responses: {
          '200': {
            description: 'Calibration snapshot or null',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    snapshot: {
                      oneOf: [
                        { $ref: '#/components/schemas/CalibrationSnapshot' },
                        { type: 'null' },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/forecasts/calibration/history': {
      get: {
        tags: ['Forecasts'],
        summary: 'Calibration history',
        operationId: 'getCalibrationHistory',
        description: 'Returns the last 10 calibration snapshots for trend tracking.',
        responses: {
          '200': {
            description: 'Snapshot list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    snapshots: { type: 'array', items: { $ref: '#/components/schemas/CalibrationSnapshot' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/forecasts/conformal/state': {
      get: {
        tags: ['Forecasts'],
        summary: 'Conformal prediction state',
        operationId: 'getConformalState',
        responses: { '200': { description: 'Conformal state' } },
      },
    },
    '/forecasts/strategies': {
      get: {
        tags: ['Forecasts'],
        summary: 'Strategy leaderboard',
        operationId: 'getStrategyLeaderboard',
        description: 'Returns forecasting strategies ranked by track record.',
        responses: { '200': { description: 'Strategy list' } },
      },
    },
    '/forecasts/{id}': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get forecast',
        operationId: 'getForecast',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Forecast detail',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { forecast: { $ref: '#/components/schemas/Forecast' } },
                },
              },
            },
          },
          '404': { description: 'Forecast not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        tags: ['Forecasts'],
        summary: 'Void forecast',
        operationId: 'voidForecast',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Forecast voided' } },
      },
    },
    '/forecasts/{id}/resolve': {
      patch: {
        tags: ['Forecasts'],
        summary: 'Resolve or void forecast',
        operationId: 'resolveForecast',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  resolution_value: { type: ['number', 'null'], description: 'Outcome value (e.g. 1 for yes, 0 for no in binary)' },
                  void: { type: 'boolean', description: 'Set to true to void instead of resolve' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Forecast resolved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { forecast: { $ref: '#/components/schemas/Forecast' } },
                },
              },
            },
          },
        },
      },
    },
    '/forecasts/{id}/resolution': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get resolution record',
        operationId: 'getForecastResolution',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Resolution details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    resolution: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        forecast_id: { type: 'string' },
                        resolution_method: { type: 'string' },
                        raw_evidence: { type: 'object' },
                        resolved_by: { type: 'string' },
                        resolved_at: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': { description: 'No resolution', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/forecasts/{id}/beliefs': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get belief history',
        operationId: 'getBeliefHistory',
        description: 'Returns Bayesian belief updates over time for a forecast.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Belief list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    beliefs: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
          '404': { description: 'Forecast not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/forecasts/{id}/intervals': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get conformal intervals',
        operationId: 'getConformalIntervals',
        description: 'Returns conformal prediction intervals for each belief step.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Interval list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    intervals: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          forecast_id: { type: 'string' },
                          belief_step: { type: 'integer' },
                          lower_bound: { type: 'number' },
                          upper_bound: { type: 'number' },
                          coverage_target: { type: 'number' },
                          nonconformity_score: { type: ['number', 'null'] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '404': { description: 'Forecast not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/forecasts/{id}/ensemble': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get ensemble prediction',
        operationId: 'getEnsemblePrediction',
        description: 'Returns aggregated multi-strategy prediction for a forecast.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Ensemble result or null' } },
      },
    },
    '/forecasts/{id}/extend': {
      patch: {
        tags: ['Forecasts'],
        summary: 'Extend forecast deadline',
        operationId: 'extendForecast',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { resolves_at: { type: 'string', format: 'date-time' } },
                required: ['resolves_at'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Deadline extended',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { forecast: { $ref: '#/components/schemas/Forecast' } },
                },
              },
            },
          },
          '404': { description: 'Forecast not found or not open', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },

    '/admin/workers': {
      get: {
        tags: ['Admin'],
        summary: 'List workers',
        operationId: 'listWorkers',
        description: 'Returns all background worker statuses and whether workers are globally paused.',
        responses: {
          '200': {
            description: 'Worker statuses',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workers: { type: 'array', items: { $ref: '#/components/schemas/Worker' } },
                    paused: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/workers/paused': {
      put: {
        tags: ['Admin'],
        summary: 'Pause/unpause workers',
        operationId: 'pauseWorkers',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { paused: { type: 'boolean' } },
                required: ['paused'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Workers paused state updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    paused: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/workers/{name}/history': {
      get: {
        tags: ['Admin'],
        summary: 'Worker run history',
        operationId: 'getWorkerHistory',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Run history' } },
      },
    },
    '/admin/workers/{name}/run': {
      post: {
        tags: ['Admin'],
        summary: 'Trigger worker run',
        operationId: 'triggerWorker',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Worker triggered' },
          '500': { description: 'Worker execution failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/admin/embedding-jobs/retry': {
      post: {
        tags: ['Admin'],
        summary: 'Retry failed embeddings',
        operationId: 'retryFailedEmbeddings',
        responses: {
          '200': {
            description: 'Number of embeddings reset',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { reset: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    '/admin/backfill-embeddings': {
      post: {
        tags: ['Admin'],
        summary: 'Backfill missing embeddings',
        operationId: 'backfillEmbeddings',
        responses: {
          '200': {
            description: 'Number of embeddings enqueued',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { enqueued: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    '/admin/reinfer-schemas': {
      post: {
        tags: ['Admin'],
        summary: 'Re-infer all schemas',
        operationId: 'reinferSchemas',
        responses: {
          '200': {
            description: 'Number of jobs queued',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { queued: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    '/admin/embedding-stats': {
      get: {
        tags: ['Admin'],
        summary: 'Embedding statistics',
        operationId: 'getEmbeddingStats',
        responses: {
          '200': {
            description: 'Embedding counts by status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    pending: { type: 'integer' },
                    ready: { type: 'integer' },
                    error: { type: 'integer' },
                    locked: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/reembed-all': {
      post: {
        tags: ['Admin'],
        summary: 'Re-embed all events',
        operationId: 'reembedAll',
        description: 'Resets all embeddings for re-generation. Expensive operation.',
        responses: {
          '200': {
            description: 'Number of embeddings reset',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { reset: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    '/admin/reprocess-entities': {
      post: {
        tags: ['Admin'],
        summary: 'Reprocess entities',
        operationId: 'reprocessEntities',
        description: 'Re-runs entity extraction on all events.',
        responses: { '200': { description: 'Reprocess result' } },
      },
    },
    '/admin/graph-health': {
      get: {
        tags: ['Admin'],
        summary: 'Graph health snapshot',
        operationId: 'getGraphHealth',
        description: 'Returns latest graph health metrics and isolated entities.',
        responses: { '200': { description: 'Graph health data' } },
      },
    },
    '/admin/topology': {
      get: {
        tags: ['Admin'],
        summary: 'Topology snapshot',
        operationId: 'getTopology',
        description: 'Returns TDA persistence diagram and knowledge gap entities.',
        responses: { '200': { description: 'Topology data' } },
      },
    },
    '/admin/drift-alerts': {
      get: {
        tags: ['Admin'],
        summary: 'Concept drift alerts',
        operationId: 'getDriftAlerts',
        description: 'Returns recent distribution drift alerts per provider.',
        responses: {
          '200': {
            description: 'Drift alert list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    alerts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          provider_type: { type: 'string' },
                          field_name: { type: 'string' },
                          detected_at: { type: 'string', format: 'date-time' },
                          old_distribution: { type: 'object' },
                          new_distribution: { type: 'object' },
                          drift_score: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/eval/run': {
      post: {
        tags: ['Admin'],
        summary: 'Run retrieval evaluation',
        operationId: 'runEval',
        responses: { '200': { description: 'Eval results with precision, recall, MRR' } },
      },
    },
    '/admin/eval/runs': {
      get: {
        tags: ['Admin'],
        summary: 'List eval runs',
        operationId: 'listEvalRuns',
        responses: {
          '200': {
            description: 'Recent eval runs',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    runs: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/EvalRun' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/eval/runs/{runId}': {
      get: {
        tags: ['Admin'],
        summary: 'Get eval run detail',
        operationId: 'getEvalRun',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Run with per-fixture results' },
          '404': { description: 'Run not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/admin/eval/fixtures': {
      get: {
        tags: ['Admin'],
        summary: 'List eval fixtures',
        operationId: 'listEvalFixtures',
        responses: { '200': { description: 'Fixture list' } },
      },
      post: {
        tags: ['Admin'],
        summary: 'Create eval fixture',
        operationId: 'createEvalFixture',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  expected_event_ids: { type: 'array', items: { type: 'string' } },
                  expected_lanes: { type: 'array', items: { type: 'string' } },
                  intent: { type: 'string' },
                  notes: { type: 'string' },
                },
                required: ['question', 'intent'],
              },
            },
          },
        },
        responses: { '201': { description: 'Fixture created' } },
      },
    },
    '/admin/eval/fixtures/{id}': {
      delete: {
        tags: ['Admin'],
        summary: 'Delete eval fixture',
        operationId: 'deleteEvalFixture',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Fixture deleted' } },
      },
    },
    '/admin/eval/promote/{messageId}': {
      post: {
        tags: ['Admin'],
        summary: 'Promote message to fixture',
        operationId: 'promoteToFixture',
        description: 'Creates an eval fixture from an upvoted assistant message.',
        parameters: [{ name: 'messageId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '201': { description: 'Fixture created' },
          '404': { description: 'Message not found or not upvoted', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
        required: ['error'],
      },
      Event: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          schema_version: { type: 'integer' },
          source: { type: 'string' },
          provider_id: { type: ['string', 'null'] },
          provider_type: { type: 'string' },
          provider_name: { type: 'string' },
          event_type: { type: 'string' },
          entity_type: { type: 'string' },
          entity_id: { type: ['string', 'null'] },
          entity_name: { type: ['string', 'null'] },
          actor_name: { type: ['string', 'null'] },
          actor_email_hash: { type: ['string', 'null'] },
          status: { type: ['string', 'null'] },
          due_at: { type: ['string', 'null'], format: 'date-time' },
          completed_at: { type: ['string', 'null'], format: 'date-time' },
          occurred_at: { type: 'string', format: 'date-time' },
          emitted_at: { type: 'string', format: 'date-time' },
          ingested_at: { type: 'string', format: 'date-time' },
          url: { type: ['string', 'null'], format: 'uri' },
          title: { type: 'string' },
          summary: { type: 'string' },
          searchable_text: { type: 'string' },
          quality: { type: 'string', enum: ['complete', 'partial', 'degraded'] },
        },
        required: ['id', 'provider_type', 'provider_name', 'event_type', 'entity_type', 'occurred_at', 'title', 'summary', 'quality'],
      },
      Entity: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          canonical_name: { type: 'string' },
          type_label: { type: 'string' },
          confidence: { type: 'number' },
          event_count: { type: 'integer' },
        },
        required: ['id', 'canonical_name', 'type_label', 'confidence'],
      },
      ChatSession: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          preview: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          message_count: { type: 'integer' },
        },
        required: ['id', 'title', 'preview', 'created_at', 'updated_at', 'message_count'],
      },
      ChatSessionDetail: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          messages: {
            type: 'array',
            items: { $ref: '#/components/schemas/ChatMessage' },
          },
        },
        required: ['id', 'title', 'created_at', 'updated_at', 'messages'],
      },
      ChatMessage: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                event_id: { type: 'string' },
                provider_name: { type: 'string' },
                occurred_at: { type: 'string', format: 'date-time' },
                title: { type: 'string' },
                score: { type: 'number' },
              },
            },
          },
          feedback: { type: ['string', 'null'], enum: ['up', 'down', null] },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'role', 'content', 'created_at'],
      },
      Forecast: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          question_type: { type: 'string', enum: ['binary', 'numeric', 'date'] },
          resolution_criteria: { type: 'string' },
          resolution_source: { type: 'object' },
          base_rate: { type: ['number', 'null'] },
          entity_id: { type: ['string', 'null'] },
          entity_name: { type: ['string', 'null'] },
          provider_type: { type: ['string', 'null'] },
          source_signal: { type: ['string', 'null'] },
          created_at: { type: 'string', format: 'date-time' },
          resolves_at: { type: 'string', format: 'date-time' },
          resolved_at: { type: ['string', 'null'], format: 'date-time' },
          resolution_value: { type: ['number', 'null'] },
          status: { type: 'string', enum: ['open', 'resolved', 'voided', 'expired'] },
        },
        required: ['id', 'question', 'question_type', 'resolution_criteria', 'created_at', 'resolves_at', 'status'],
      },
      Community: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          importance: { type: 'number' },
          member_count: { type: 'integer' },
          generated_at: { type: 'string', format: 'date-time' },
          stale: { type: 'boolean' },
          members: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type_label: { type: 'string' },
              },
            },
          },
        },
        required: ['id', 'title', 'summary', 'importance', 'member_count'],
      },
      Narrative: {
        type: 'object',
        properties: {
          entity_id: { type: 'string' },
          entity_name: { type: 'string' },
          text: { type: 'string' },
          source_event_count: { type: 'integer' },
          generated_at: { type: 'string', format: 'date-time' },
          staleness_score: { type: 'number' },
        },
        required: ['entity_id', 'entity_name', 'text', 'source_event_count', 'generated_at'],
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          read: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
          metadata: { type: 'object' },
        },
        required: ['id', 'type', 'title', 'body', 'read', 'created_at'],
      },
      Resource: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          filename: { type: 'string' },
          mime_type: { type: 'string' },
          size_bytes: { type: 'integer' },
          status: { type: 'string', enum: ['processing', 'ready', 'error'] },
          chunk_count: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'filename', 'mime_type', 'size_bytes', 'status', 'created_at'],
      },
      Proposal: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          action_type: { type: 'string', enum: ['create_task', 'tag_client', 'annotate_contract'] },
          target_provider: { type: 'string' },
          target_entity_id: { type: ['string', 'null'] },
          target_entity_name: { type: ['string', 'null'] },
          title: { type: 'string' },
          description: { type: 'string' },
          payload: { type: 'object' },
          confidence: { type: 'number' },
          status: { type: 'string', enum: ['proposed', 'approved', 'executed', 'dismissed', 'failed'] },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'action_type', 'target_provider', 'title', 'description', 'status', 'created_at'],
      },
      Workspace: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          role: { type: 'string', enum: ['owner', 'admin', 'member'] },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name', 'slug'],
      },
      Worker: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['idle', 'running', 'error'] },
          last_run_at: { type: ['string', 'null'], format: 'date-time' },
          last_duration_ms: { type: ['integer', 'null'] },
          last_error: { type: ['string', 'null'] },
          run_count: { type: 'integer' },
        },
        required: ['name', 'status'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: ['string', 'null'] },
          role: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'name'],
      },
      MatchCandidate: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          source_entity_id: { type: 'string' },
          source_entity_name: { type: 'string' },
          target_entity_id: { type: 'string' },
          target_entity_name: { type: 'string' },
          similarity_score: { type: 'number', minimum: 0, maximum: 1 },
          match_method: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'source_entity_id', 'source_entity_name', 'target_entity_id', 'target_entity_name', 'similarity_score', 'match_method', 'status', 'created_at'],
      },
      GraphNode: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string' },
        },
        required: ['id', 'name', 'type'],
      },
      GraphEdge: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          label: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['from', 'to', 'label', 'confidence'],
      },
      PathResult: {
        type: 'object',
        properties: {
          path: { type: 'array', items: { $ref: '#/components/schemas/GraphNode' } },
          edges: { type: 'array', items: { $ref: '#/components/schemas/GraphEdge' } },
          totalConfidence: { type: 'number', description: 'Product of all edge confidences along the path' },
        },
        required: ['path', 'edges', 'totalConfidence'],
      },
      NookEventEnvelope: {
        type: 'object',
        properties: {
          schemaVersion: { type: 'integer', const: 1 },
          id: { type: 'string' },
          occurredAt: { type: 'string', format: 'date-time' },
          emittedAt: { type: 'string', format: 'date-time' },
          source: { type: 'string', enum: ['webhook', 'website', 'imap', 'system', 'test'] },
          provider: {
            type: 'object',
            properties: {
              id: { type: ['string', 'null'] },
              type: { type: 'string' },
              name: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['type', 'name', 'tags'],
          },
          event: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              title: { type: ['string', 'null'] },
              messageHtml: { type: ['string', 'null'] },
              messageText: { type: ['string', 'null'] },
              url: { type: ['string', 'null'] },
            },
            required: ['type'],
          },
          actor: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  id: { type: ['string', 'null'] },
                  name: { type: ['string', 'null'] },
                  email: { type: ['string', 'null'] },
                },
              },
              { type: 'null' },
            ],
          },
          subject: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              id: { type: ['string', 'null'] },
              name: { type: ['string', 'null'] },
              url: { type: ['string', 'null'] },
            },
            required: ['type'],
          },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                mime_type: { type: 'string' },
                url: { type: 'string' },
                size: { type: 'integer' },
              },
              required: ['name', 'mime_type', 'url'],
            },
          },
          payload: {
            type: 'object',
            properties: {
              normalized: { type: 'object' },
              raw: {},
            },
          },
          privacy: {
            type: 'object',
            properties: {
              containsPii: { type: 'boolean' },
              rawPayloadAllowed: { type: 'boolean' },
            },
          },
        },
        required: ['schemaVersion', 'id', 'occurredAt', 'emittedAt', 'source', 'provider', 'event', 'subject', 'payload', 'privacy'],
      },
      ProviderSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          provider_type: { type: 'string' },
          event_type_pattern: { type: ['string', 'null'] },
          field_mappings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source_key: { type: 'string' },
                target_key: { type: 'string' },
                type: { type: 'string', enum: ['text', 'date_iso', 'number', 'boolean', 'hash_email'] },
                role: { type: 'string', enum: ['status', 'id', 'name', 'actor', 'date', 'url', 'count', 'other'] },
                confidence: { type: 'number' },
              },
            },
          },
          searchable_text_template: { type: ['string', 'null'] },
          sample_keys_hash: { type: 'string' },
          needs_review: { type: 'boolean' },
          inferred_at: { type: 'string', format: 'date-time' },
          confirmed_at: { type: ['string', 'null'], format: 'date-time' },
          inferred_by: { type: ['string', 'null'] },
        },
        required: ['id', 'provider_type', 'field_mappings', 'needs_review', 'inferred_at'],
      },
      StatsSnapshot: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string' },
          window_start: { type: 'string', format: 'date-time' },
          window_end: { type: 'string', format: 'date-time' },
          generated_at: { type: 'string', format: 'date-time' },
          source_count: { type: 'integer' },
          min_sample_met: { type: 'boolean' },
          data: { type: 'object' },
        },
        required: ['id', 'kind', 'window_start', 'window_end', 'generated_at', 'source_count', 'min_sample_met', 'data'],
      },
      CalibrationSnapshot: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          computed_at: { type: 'string', format: 'date-time' },
          bin_edges: { type: 'array', items: { type: 'number' } },
          bin_counts: { type: 'array', items: { type: 'integer' } },
          bin_actuals: { type: 'array', items: { type: 'number' } },
          brier_score: { type: 'number' },
          log_score: { type: 'number' },
          resolution_score: { type: 'number' },
          reliability_score: { type: 'number' },
          uncertainty_score: { type: 'number' },
          sharpness_score: { type: 'number' },
          domain_scores: { type: 'object' },
          forecast_count: { type: 'integer' },
        },
        required: ['id', 'computed_at', 'brier_score', 'forecast_count'],
      },
      EvalRun: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          ran_at: { type: 'string', format: 'date-time' },
          fixture_count: { type: 'integer' },
          precision_at_5: { type: 'number' },
          recall_at_5: { type: 'number' },
          mrr: { type: 'number' },
          lane_hit_rates: { type: 'object' },
          duration_ms: { type: 'integer' },
          regression_detected: { type: 'boolean' },
        },
        required: ['id', 'ran_at', 'fixture_count'],
      },
    },
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'perception_session',
        description: 'Session cookie set by /auth/login or /auth/oidc/callback',
      },
    },
  },
  security: [{ cookieAuth: [] as const }],
};
