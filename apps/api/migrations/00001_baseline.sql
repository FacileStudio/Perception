-- +goose Up
-- baseline: the schema schemas.Migrate built (GORM AutoMigrate, porte/pg.EnsureSchema from
-- porte v0.5.2, and its own DDL) on an empty Postgres 16 with pgvector, captured 2026-11-13 with
-- pg_dump --schema-only --no-owner --no-privileges. Perception was never deployed, so no
-- production schema exists to copy. The vector type and operator class stay qualified: a test
-- schema's search_path does not include public, where the extension lives.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE event_embeddings (
    event_id text NOT NULL,
    embedding public.vector(1024),
    model character varying(64),
    input_hash text,
    status character varying(16) DEFAULT 'pending'::character varying,
    attempts bigint DEFAULT 0,
    last_attempt_at timestamp with time zone,
    last_error text,
    embedded_at timestamp with time zone,
    created_at timestamp with time zone
);

CREATE TABLE events (
    id text NOT NULL,
    schema_version bigint,
    source text,
    provider_id text,
    provider_type text,
    provider_name text,
    provider_tags jsonb,
    entity_type text,
    entity_ref text,
    entity_name text,
    entity_url text,
    actor_ref text,
    actor_name text,
    actor_email text,
    occurred_at timestamp with time zone,
    emitted_at timestamp with time zone,
    ingested_at timestamp with time zone,
    event_type text,
    title text,
    summary text,
    url text,
    searchable_text text,
    payload_normalized jsonb,
    payload_raw jsonb,
    payload_hash text,
    contains_pii boolean,
    quality text,
    search tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, COALESCE(searchable_text, ''::text))) STORED
);

CREATE TABLE ingest_rejections (
    id bigint NOT NULL,
    reason text,
    event_id text,
    source_ip_hash text,
    payload_hash text,
    rejected_at timestamp with time zone
);

CREATE SEQUENCE ingest_rejections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE ingest_rejections_id_seq OWNED BY ingest_rejections.id;

CREATE TABLE porte_identities (
    user_id bigint NOT NULL,
    provider text NOT NULL,
    subject text NOT NULL,
    password_hash text DEFAULT ''::text NOT NULL,
    access_token text DEFAULT ''::text NOT NULL,
    refresh_token text DEFAULT ''::text NOT NULL,
    token_expiry timestamp with time zone,
    roles jsonb,
    roles_synced_at timestamp with time zone,
    synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE porte_login_codes (
    code_hash text NOT NULL,
    user_id bigint NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone
);

CREATE TABLE porte_sessions (
    id bigint NOT NULL,
    token_hash text NOT NULL,
    user_id bigint NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);

CREATE SEQUENCE porte_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE porte_sessions_id_seq OWNED BY porte_sessions.id;

CREATE TABLE porte_users (
    id bigint NOT NULL,
    facile_id text,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    avatar_url text DEFAULT ''::text NOT NULL,
    avatar_source text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE porte_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE porte_users_id_seq OWNED BY porte_users.id;

ALTER TABLE ONLY ingest_rejections ALTER COLUMN id SET DEFAULT nextval('ingest_rejections_id_seq'::regclass);

ALTER TABLE ONLY porte_sessions ALTER COLUMN id SET DEFAULT nextval('porte_sessions_id_seq'::regclass);

ALTER TABLE ONLY porte_users ALTER COLUMN id SET DEFAULT nextval('porte_users_id_seq'::regclass);

ALTER TABLE ONLY event_embeddings
    ADD CONSTRAINT event_embeddings_pkey PRIMARY KEY (event_id);

ALTER TABLE ONLY events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY ingest_rejections
    ADD CONSTRAINT ingest_rejections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY porte_identities
    ADD CONSTRAINT porte_identities_pkey PRIMARY KEY (provider, subject);

ALTER TABLE ONLY porte_login_codes
    ADD CONSTRAINT porte_login_codes_pkey PRIMARY KEY (code_hash);

ALTER TABLE ONLY porte_sessions
    ADD CONSTRAINT porte_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY porte_sessions
    ADD CONSTRAINT porte_sessions_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY porte_users
    ADD CONSTRAINT porte_users_email_key UNIQUE (email);

ALTER TABLE ONLY porte_users
    ADD CONSTRAINT porte_users_facile_id_key UNIQUE (facile_id);

ALTER TABLE ONLY porte_users
    ADD CONSTRAINT porte_users_pkey PRIMARY KEY (id);

CREATE INDEX idx_event_embeddings_embedding ON event_embeddings USING hnsw (embedding public.vector_cosine_ops);

CREATE INDEX idx_event_embeddings_status ON event_embeddings USING btree (status);

CREATE INDEX idx_events_actor_email ON events USING btree (actor_email);

CREATE INDEX idx_events_entity ON events USING btree (entity_type, entity_name);

CREATE INDEX idx_events_occurred ON events USING btree (occurred_at DESC);

CREATE INDEX idx_events_provider_time ON events USING btree (provider_type, occurred_at DESC);

CREATE INDEX idx_events_quality ON events USING btree (quality);

CREATE INDEX idx_events_search ON events USING gin (search);

CREATE INDEX idx_events_source ON events USING btree (source);

CREATE INDEX idx_events_type ON events USING btree (event_type);

CREATE INDEX idx_rejections_reason ON ingest_rejections USING btree (reason);

CREATE INDEX idx_rejections_time ON ingest_rejections USING btree (rejected_at DESC);

CREATE INDEX porte_identities_user_idx ON porte_identities USING btree (user_id);

CREATE INDEX porte_sessions_expiry_idx ON porte_sessions USING btree (expires_at) WHERE (expires_at IS NOT NULL);

CREATE INDEX porte_sessions_user_idx ON porte_sessions USING btree (user_id);

ALTER TABLE ONLY porte_identities
    ADD CONSTRAINT porte_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES porte_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY porte_login_codes
    ADD CONSTRAINT porte_login_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES porte_users(id) ON DELETE CASCADE;

ALTER TABLE ONLY porte_sessions
    ADD CONSTRAINT porte_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES porte_users(id) ON DELETE CASCADE;

-- +goose Down
SELECT 'baseline migration is not reversible' WHERE false;
