export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Perception API',
    version: '1.0.0',
    description:
      'Context brain for Facile operations — event ingestion, entity resolution, and operational intelligence.',
  },
  servers: [{ url: '/', description: 'Current host' }],
  tags: [
    { name: 'Health', description: 'Liveness and readiness probes' },
    { name: 'Auth', description: 'Authentication and session management' },
    { name: 'Ingest', description: 'HMAC-signed event ingestion from Nook' },
    { name: 'Chat', description: 'Conversational retrieval and streaming responses' },
    { name: 'Events', description: 'Browse, inspect, and delete ingested events' },
    { name: 'Entities', description: 'Knowledge graph, communities, and narratives' },
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
        description: 'Returns server status, startup errors, and auth configuration state.',
        responses: { '200': { description: 'Server is alive' } },
      },
    },
    '/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness check',
        description: 'Returns 200 when migrations are complete and the database is reachable.',
        responses: {
          '200': { description: 'Ready' },
          '503': { description: 'Not ready or database unavailable' },
        },
      },
    },

    '/auth/config': {
      get: {
        tags: ['Auth'],
        summary: 'Auth configuration',
        description: 'Returns whether SSO-only mode and OIDC are enabled.',
        responses: { '200': { description: 'Auth config' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Password login',
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
          '401': { description: 'Wrong password' },
          '429': { description: 'Rate limited' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        description: 'Destroy the current session.',
        responses: { '200': { description: 'Logged out' } },
      },
    },
    '/auth/status': {
      get: {
        tags: ['Auth'],
        summary: 'Session status',
        description: 'Returns the current authenticated user or null.',
        responses: { '200': { description: 'Session info' } },
      },
    },
    '/auth/oidc': {
      get: {
        tags: ['Auth'],
        summary: 'Initiate OIDC login',
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
        description: 'Handles the OIDC provider callback, creates a session, and redirects to the client.',
        responses: { '302': { description: 'Redirect to client app' } },
      },
    },

    '/ingest': {
      post: {
        tags: ['Ingest'],
        summary: 'Ingest event',
        description:
          'Receives an HMAC-SHA256 signed event envelope from Nook. Requires x-perception-workspace, x-nook-event-id, x-nook-timestamp, x-nook-schema-version, and x-nook-signature-256 headers.',
        parameters: [
          { name: 'x-perception-workspace', in: 'header', required: true, schema: { type: 'string' } },
          { name: 'x-nook-event-id', in: 'header', required: true, schema: { type: 'string' } },
          { name: 'x-nook-timestamp', in: 'header', required: true, schema: { type: 'string' } },
          { name: 'x-nook-schema-version', in: 'header', required: false, schema: { type: 'string' } },
          { name: 'x-nook-signature-256', in: 'header', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '202': { description: 'Event accepted for processing' },
          '400': { description: 'Missing workspace header or invalid JSON' },
          '401': { description: 'HMAC signature verification failed' },
        },
      },
    },

    '/chat': {
      post: {
        tags: ['Chat'],
        summary: 'Send chat message',
        description:
          'Sends a message and streams an SSE response. Performs query planning, retrieval (vector, SQL, narrative, counterfactual), and LLM generation.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  session_id: { type: 'string', nullable: true },
                },
                required: ['message'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'SSE stream with X-Session-Id header' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/chat/sessions': {
      get: {
        tags: ['Chat'],
        summary: 'List chat sessions',
        description: 'Returns session summaries for the current user.',
        responses: { '200': { description: 'Session list' } },
      },
    },
    '/chat/sessions/{sessionId}': {
      get: {
        tags: ['Chat'],
        summary: 'Get session detail',
        description: 'Returns full message history for a session.',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Session with messages' },
          '404': { description: 'Session not found' },
        },
      },
      delete: {
        tags: ['Chat'],
        summary: 'Delete session',
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Session deleted' },
          '404': { description: 'Session not found' },
        },
      },
    },
    '/chat/messages/{messageId}/feedback': {
      patch: {
        tags: ['Chat'],
        summary: 'Set message feedback',
        description: 'Thumbs-up/down on an assistant message. Used for retrieval eval promotion.',
        parameters: [{ name: 'messageId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  feedback: { type: 'string', enum: ['up', 'down'], nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Feedback saved' },
          '400': { description: 'Invalid feedback value or not an assistant message' },
          '404': { description: 'Message not found' },
        },
      },
    },

    '/events': {
      get: {
        tags: ['Events'],
        summary: 'List events',
        description: 'Paginated event list with filters for query, provider, entity type, quality, and date range.',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'provider_type', in: 'query', schema: { type: 'string' } },
          { name: 'entity_type', in: 'query', schema: { type: 'string' } },
          { name: 'quality', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Event list with total count' } },
      },
    },
    '/events/{id}': {
      get: {
        tags: ['Events'],
        summary: 'Get event detail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Event detail with entities and facts' },
          '404': { description: 'Event not found' },
        },
      },
      delete: {
        tags: ['Events'],
        summary: 'Delete event',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Event deleted' },
          '404': { description: 'Event not found' },
        },
      },
    },

    '/entities/graph': {
      get: {
        tags: ['Entities'],
        summary: 'Get entity graph',
        description: 'Returns top 200 entities and all relations for the knowledge graph visualization.',
        responses: { '200': { description: 'Entities and relations' } },
      },
    },
    '/entities/communities': {
      get: {
        tags: ['Entities'],
        summary: 'List entity communities',
        description: 'Returns Louvain-detected communities with member entities and summaries.',
        responses: { '200': { description: 'Community list' } },
      },
    },
    '/entities/narratives': {
      get: {
        tags: ['Entities'],
        summary: 'List entity narratives',
        description: 'Returns LLM-generated operational narratives for entities.',
        responses: { '200': { description: 'Narrative list' } },
      },
    },
    '/entities/{id}/narrative': {
      get: {
        tags: ['Entities'],
        summary: 'Get entity narrative',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Narrative or null' } },
      },
    },
    '/entities/{id}/community': {
      get: {
        tags: ['Entities'],
        summary: 'Get entity community',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Community or null' } },
      },
    },
    '/entities/relations/resolve-all': {
      post: {
        tags: ['Entities'],
        summary: 'Resolve all missing relations',
        description: 'Triggers LLM-based relation extraction for entities without relations.',
        responses: { '200': { description: 'Number of relations created' } },
      },
    },

    '/schemas': {
      get: {
        tags: ['Schemas'],
        summary: 'List provider schemas',
        description: 'Paginated list of inferred and confirmed provider schemas.',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Schema list with total count' } },
      },
    },
    '/schemas/jobs': {
      get: {
        tags: ['Schemas'],
        summary: 'List schema inference jobs',
        responses: { '200': { description: 'Recent inference jobs' } },
      },
    },
    '/schemas/{id}': {
      get: {
        tags: ['Schemas'],
        summary: 'Get schema detail',
        description: 'Returns full schema with parsed field mappings.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Schema detail' },
          '404': { description: 'Schema not found' },
        },
      },
    },
    '/schemas/{id}/confirm': {
      post: {
        tags: ['Schemas'],
        summary: 'Confirm schema',
        description: 'Marks a schema as confirmed and upgrades associated events to complete quality.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Schema confirmed' },
          '404': { description: 'Schema not found' },
        },
      },
    },
    '/schemas/{id}/reject': {
      post: {
        tags: ['Schemas'],
        summary: 'Reject schema',
        description: 'Deletes the inferred schema.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Schema rejected' },
          '404': { description: 'Schema not found' },
        },
      },
    },

    '/stats': {
      get: {
        tags: ['Stats'],
        summary: 'Get dashboard stats',
        description: 'Returns latest stat snapshots and graph health. Auto-refreshes stale data.',
        parameters: [
          { name: 'refresh', in: 'query', schema: { type: 'string', enum: ['1'] } },
        ],
        responses: { '200': { description: 'Snapshots and graph health' } },
      },
    },
    '/stats/intelligence': {
      get: {
        tags: ['Stats'],
        summary: 'Intelligence overview',
        description:
          'Comprehensive view: graph health, memory episodes, change points, drift alerts, entity coverage, provider health, isolated entities.',
        responses: { '200': { description: 'Intelligence dashboard data' } },
      },
    },

    '/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get settings',
        description: 'Returns current effective settings with sensitive values masked.',
        responses: { '200': { description: 'Settings with source annotations' } },
      },
      put: {
        tags: ['Settings'],
        summary: 'Update settings',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', additionalProperties: { type: 'string', nullable: true } },
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
        description: 'Returns LLM and embedding token usage grouped by model, with estimated USD costs.',
        responses: { '200': { description: 'Usage breakdown' } },
      },
    },

    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Current user',
        responses: { '200': { description: 'Current user profile' } },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List workspace members',
        responses: { '200': { description: 'User list' } },
      },
    },

    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List notifications',
        description: 'Paginated notification list with unread/read/all filter.',
        parameters: [
          { name: 'filter', in: 'query', schema: { type: 'string', enum: ['all', 'unread', 'read'], default: 'all' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Notification list with total' } },
      },
    },
    '/notifications/unread-count': {
      get: {
        tags: ['Notifications'],
        summary: 'Unread count',
        responses: { '200': { description: 'Count of unread notifications' } },
      },
    },
    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark as read',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Marked as read' } },
      },
    },
    '/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all as read',
        responses: { '200': { description: 'All marked as read' } },
      },
    },

    '/resources': {
      get: {
        tags: ['Resources'],
        summary: 'List resources',
        description: 'Returns uploaded documents with metadata and processing status.',
        responses: { '200': { description: 'Resource list' } },
      },
      post: {
        tags: ['Resources'],
        summary: 'Upload resource',
        description:
          'Upload documents via multipart form data or base64 JSON. Supports PDF, TXT, Markdown, CSV, JSON. Max 50 MB.',
        responses: {
          '201': { description: 'Resource IDs created' },
          '400': { description: 'Unsupported MIME type or missing file' },
        },
      },
    },
    '/resources/{id}': {
      get: {
        tags: ['Resources'],
        summary: 'Get resource detail',
        description: 'Returns resource metadata and all chunks.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Resource with chunks' },
          '404': { description: 'Resource not found' },
        },
      },
      delete: {
        tags: ['Resources'],
        summary: 'Delete resource',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Resource deleted' },
          '404': { description: 'Resource not found' },
        },
      },
    },
    '/resources/{id}/file': {
      get: {
        tags: ['Resources'],
        summary: 'Download resource file',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'File download' },
          '404': { description: 'File not found' },
        },
      },
    },

    '/proposals': {
      get: {
        tags: ['Proposals'],
        summary: 'List proposals',
        description: 'Returns action proposals with optional status filter.',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['proposed', 'approved', 'executed', 'dismissed', 'failed'] } },
        ],
        responses: { '200': { description: 'Proposal list' } },
      },
      post: {
        tags: ['Proposals'],
        summary: 'Create proposal',
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
                  confidence: { type: 'number' },
                },
                required: ['action_type', 'target_provider', 'title', 'description'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Proposal created' },
          '400': { description: 'Missing fields or invalid action type' },
        },
      },
    },
    '/proposals/{id}/approve': {
      patch: {
        tags: ['Proposals'],
        summary: 'Approve and execute proposal',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Proposal approved and executed' },
          '404': { description: 'Proposal not found or not in proposed state' },
        },
      },
    },
    '/proposals/{id}/dismiss': {
      patch: {
        tags: ['Proposals'],
        summary: 'Dismiss proposal',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Proposal dismissed' },
          '404': { description: 'Proposal not found or not in proposed state' },
        },
      },
    },

    '/workspaces': {
      get: {
        tags: ['Workspaces'],
        summary: 'List workspaces',
        description: 'Returns all workspaces the current user belongs to.',
        responses: { '200': { description: 'Workspace list with active ID' } },
      },
      post: {
        tags: ['Workspaces'],
        summary: 'Create workspace',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  slug: { type: 'string' },
                },
                required: ['name'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Workspace created' },
          '409': { description: 'Slug already taken' },
        },
      },
    },
    '/workspaces/switch': {
      post: {
        tags: ['Workspaces'],
        summary: 'Switch active workspace',
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
          '403': { description: 'Not a member' },
        },
      },
    },
    '/workspaces/{id}': {
      patch: {
        tags: ['Workspaces'],
        summary: 'Update workspace',
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
          '403': { description: 'Forbidden' },
          '409': { description: 'Slug already taken' },
        },
      },
    },
    '/workspaces/{id}/settings': {
      get: {
        tags: ['Workspaces'],
        summary: 'Get workspace settings',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Settings with source annotations' } },
      },
      put: {
        tags: ['Workspaces'],
        summary: 'Update workspace settings',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/workspaces/{id}/members': {
      get: {
        tags: ['Workspaces'],
        summary: 'List workspace members',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Member list' } },
      },
    },
    '/workspaces/{id}/invite': {
      post: {
        tags: ['Workspaces'],
        summary: 'Invite user to workspace',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  role: { type: 'string', enum: ['admin', 'member'] },
                },
                required: ['email'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'User invited' },
          '409': { description: 'Already a member' },
        },
      },
    },
    '/workspaces/{id}/members/{memberId}': {
      delete: {
        tags: ['Workspaces'],
        summary: 'Remove member',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'memberId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Member removed' },
          '403': { description: 'Cannot remove owner' },
          '404': { description: 'Member not found' },
        },
      },
    },
    '/workspaces/{id}/members/{memberId}/role': {
      patch: {
        tags: ['Workspaces'],
        summary: 'Change member role',
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
          '403': { description: 'Only owner can change roles' },
        },
      },
    },
    '/workspaces/{id}/stats': {
      get: {
        tags: ['Workspaces'],
        summary: 'Workspace stats',
        description: 'Quick counts: events, entities, sessions, open forecasts.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Stat counts' } },
      },
    },

    '/forecasts': {
      get: {
        tags: ['Forecasts'],
        summary: 'List forecasts',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'resolved', 'voided'] } },
        ],
        responses: { '200': { description: 'Forecast list' } },
      },
      post: {
        tags: ['Forecasts'],
        summary: 'Create forecast',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  question_type: { type: 'string', enum: ['binary', 'numeric', 'date'] },
                  resolution_criteria: { type: 'string' },
                  resolves_at: { type: 'string', format: 'date-time' },
                },
                required: ['question', 'question_type', 'resolution_criteria', 'resolves_at'],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Forecast created' },
          '400': { description: 'Missing fields or invalid type' },
        },
      },
    },
    '/forecasts/calibration': {
      get: {
        tags: ['Forecasts'],
        summary: 'Latest calibration snapshot',
        description: 'Returns Brier score, reliability, resolution, sharpness, and bin data.',
        responses: { '200': { description: 'Calibration snapshot or null' } },
      },
    },
    '/forecasts/calibration/history': {
      get: {
        tags: ['Forecasts'],
        summary: 'Calibration history',
        description: 'Returns the last 10 calibration snapshots for trend tracking.',
        responses: { '200': { description: 'Snapshot list' } },
      },
    },
    '/forecasts/conformal/state': {
      get: {
        tags: ['Forecasts'],
        summary: 'Conformal prediction state',
        responses: { '200': { description: 'Conformal state' } },
      },
    },
    '/forecasts/strategies': {
      get: {
        tags: ['Forecasts'],
        summary: 'Strategy leaderboard',
        description: 'Returns forecasting strategies ranked by track record.',
        responses: { '200': { description: 'Strategy list' } },
      },
    },
    '/forecasts/{id}': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get forecast',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Forecast detail' },
          '404': { description: 'Forecast not found' },
        },
      },
      delete: {
        tags: ['Forecasts'],
        summary: 'Void forecast',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Forecast voided' } },
      },
    },
    '/forecasts/{id}/resolve': {
      patch: {
        tags: ['Forecasts'],
        summary: 'Resolve or void forecast',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  resolution_value: { type: 'number', nullable: true },
                  void: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Forecast resolved' } },
      },
    },
    '/forecasts/{id}/resolution': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get resolution record',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Resolution details' },
          '404': { description: 'No resolution' },
        },
      },
    },
    '/forecasts/{id}/beliefs': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get belief history',
        description: 'Returns Bayesian belief updates over time for a forecast.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Belief list' },
          '404': { description: 'Forecast not found' },
        },
      },
    },
    '/forecasts/{id}/intervals': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get conformal intervals',
        description: 'Returns conformal prediction intervals for each belief step.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Interval list' },
          '404': { description: 'Forecast not found' },
        },
      },
    },
    '/forecasts/{id}/ensemble': {
      get: {
        tags: ['Forecasts'],
        summary: 'Get ensemble prediction',
        description: 'Returns aggregated multi-strategy prediction for a forecast.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Ensemble result or null' } },
      },
    },
    '/forecasts/{id}/extend': {
      patch: {
        tags: ['Forecasts'],
        summary: 'Extend forecast deadline',
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
          '200': { description: 'Deadline extended' },
          '404': { description: 'Forecast not found or not open' },
        },
      },
    },

    '/admin/workers': {
      get: {
        tags: ['Admin'],
        summary: 'List workers',
        description: 'Returns all background worker statuses and whether workers are globally paused.',
        responses: { '200': { description: 'Worker statuses' } },
      },
    },
    '/admin/workers/paused': {
      put: {
        tags: ['Admin'],
        summary: 'Pause/unpause workers',
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
        responses: { '200': { description: 'Workers paused state updated' } },
      },
    },
    '/admin/workers/{name}/history': {
      get: {
        tags: ['Admin'],
        summary: 'Worker run history',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Run history' } },
      },
    },
    '/admin/workers/{name}/run': {
      post: {
        tags: ['Admin'],
        summary: 'Trigger worker run',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Worker triggered' },
          '500': { description: 'Worker execution failed' },
        },
      },
    },
    '/admin/embedding-jobs/retry': {
      post: {
        tags: ['Admin'],
        summary: 'Retry failed embeddings',
        responses: { '200': { description: 'Number of embeddings reset' } },
      },
    },
    '/admin/backfill-embeddings': {
      post: {
        tags: ['Admin'],
        summary: 'Backfill missing embeddings',
        responses: { '200': { description: 'Number of embeddings enqueued' } },
      },
    },
    '/admin/reinfer-schemas': {
      post: {
        tags: ['Admin'],
        summary: 'Re-infer all schemas',
        responses: { '200': { description: 'Number of jobs queued' } },
      },
    },
    '/admin/embedding-stats': {
      get: {
        tags: ['Admin'],
        summary: 'Embedding statistics',
        responses: { '200': { description: 'Embedding counts by status' } },
      },
    },
    '/admin/reembed-all': {
      post: {
        tags: ['Admin'],
        summary: 'Re-embed all events',
        description: 'Resets all embeddings for re-generation. Expensive operation.',
        responses: { '200': { description: 'Number of embeddings reset' } },
      },
    },
    '/admin/reprocess-entities': {
      post: {
        tags: ['Admin'],
        summary: 'Reprocess entities',
        description: 'Re-runs entity extraction on all events.',
        responses: { '200': { description: 'Reprocess result' } },
      },
    },
    '/admin/graph-health': {
      get: {
        tags: ['Admin'],
        summary: 'Graph health snapshot',
        description: 'Returns latest graph health metrics and isolated entities.',
        responses: { '200': { description: 'Graph health data' } },
      },
    },
    '/admin/topology': {
      get: {
        tags: ['Admin'],
        summary: 'Topology snapshot',
        description: 'Returns TDA persistence diagram and knowledge gap entities.',
        responses: { '200': { description: 'Topology data' } },
      },
    },
    '/admin/drift-alerts': {
      get: {
        tags: ['Admin'],
        summary: 'Concept drift alerts',
        description: 'Returns recent distribution drift alerts per provider.',
        responses: { '200': { description: 'Drift alert list' } },
      },
    },
    '/admin/eval/run': {
      post: {
        tags: ['Admin'],
        summary: 'Run retrieval evaluation',
        responses: { '200': { description: 'Eval results with precision, recall, MRR' } },
      },
    },
    '/admin/eval/runs': {
      get: {
        tags: ['Admin'],
        summary: 'List eval runs',
        responses: { '200': { description: 'Recent eval runs' } },
      },
    },
    '/admin/eval/runs/{runId}': {
      get: {
        tags: ['Admin'],
        summary: 'Get eval run detail',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Run with per-fixture results' },
          '404': { description: 'Run not found' },
        },
      },
    },
    '/admin/eval/fixtures': {
      get: {
        tags: ['Admin'],
        summary: 'List eval fixtures',
        responses: { '200': { description: 'Fixture list' } },
      },
      post: {
        tags: ['Admin'],
        summary: 'Create eval fixture',
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
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Fixture deleted' } },
      },
    },
    '/admin/eval/promote/{messageId}': {
      post: {
        tags: ['Admin'],
        summary: 'Promote message to fixture',
        description: 'Creates an eval fixture from an upvoted assistant message.',
        parameters: [{ name: 'messageId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '201': { description: 'Fixture created' },
          '404': { description: 'Message not found or not upvoted' },
        },
      },
    },
  },
};
