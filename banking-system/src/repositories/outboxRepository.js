import { v4 as uuidv4 } from "uuid";
import { pool } from "../config/db.js";

export async function createOutboxEvent(client, { eventType, aggregateId, payload }) {
    const res = await client.query(
        `INSERT INTO outbox_events (id, event_type, aggregate_id, payload, status, retry_count)
         VALUES ($1, $2, $3, $4::jsonb, 'PENDING', 0)
         RETURNING *`,
        [uuidv4(), eventType, aggregateId, JSON.stringify(payload)]
    );
    return res.rows[0];
}

export async function fetchPendingOutboxEvents(limit = 20, processingTimeoutMs = 30000) {
    const res = await pool.query(
        `WITH next_events AS (
            SELECT id
            FROM outbox_events
            WHERE status = 'PENDING'
               OR (
                    status = 'PROCESSING'
                    AND locked_at < NOW() - ($2::int * INTERVAL '1 millisecond')
               )
            ORDER BY created_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED   --this will lock the rows for update so that no other transaction can update the same row until the current transaction is committed or rolled back
         )
         UPDATE outbox_events
         SET status = 'PROCESSING', locked_at = NOW()
         FROM next_events
         WHERE outbox_events.id = next_events.id
         RETURNING outbox_events.*`,
        [limit, processingTimeoutMs]
    );
    return res.rows;
}

export async function markOutboxEventSent(id) {
    const res = await pool.query(
        `UPDATE outbox_events
         SET status = 'SENT', sent_at = NOW(), locked_at = NULL
         WHERE id = $1
         RETURNING *`,
        [id]
    );
    return res.rows[0];
}

export async function markOutboxEventFailed(id) {
    const res = await pool.query(
        `UPDATE outbox_events
         SET status = 'PENDING', retry_count = retry_count + 1, locked_at = NULL
         WHERE id = $1
         RETURNING *`,
        [id]
    );
    return res.rows[0];
}

export async function ensureOutboxTable() {
    await pool.query(`
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
        )
    `);
}
