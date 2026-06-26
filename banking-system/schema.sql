CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    balance NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY,
    from_account TEXT NOT NULL REFERENCES accounts(id),
    to_account TEXT NOT NULL REFERENCES accounts(id),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED')),
    retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY,
    event_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
    retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS dlq (
    id UUID PRIMARY KEY,
    transaction_id UUID,
    original_message JSONB NOT NULL,
    error_reason TEXT NOT NULL,
    retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications(
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES transactions(id),
    recipient_account TEXT NOT NULL REFERENCES accounts(id),
    notification_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING','SENT','FAILED')),
    payload JSONB NOT NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS notification_dlq (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES transactions(id),
    original_message JSONB NOT NULL,
    error_reason TEXT NOT NULL,
    retry_count INT NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES transactions(id),
    actor TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_transaction_created_at_idx 
ON audit_logs(transaction_id,created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_created_at_idx
ON audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_transaction_created_at_idx
ON notifications(transaction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_status_created_at_idx
ON notifications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_dlq_created_at_idx
ON notification_dlq(created_at DESC);

CREATE INDEX IF NOT EXISTS notification_dlq_transaction_created_at_idx
ON notification_dlq(transaction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_status_idx
ON transactions(status);

CREATE INDEX IF NOT EXISTS transactions_created_at_idx
ON transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS outbox_events_status_created_at_idx
ON outbox_events(status, created_at);

CREATE INDEX IF NOT EXISTS dlq_created_at_idx
ON dlq(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_delivery_unique_idx
ON notifications(transaction_id, recipient_account, notification_type);
