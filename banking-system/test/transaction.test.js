import assert from "node:assert/strict";
import test from "node:test";
import {
    createTransaction,
    ensureTransactionIdempotencyConstraint
} from "../src/repositories/transactionRepository.js";
import { fetchPendingOutboxEvents } from "../src/repositories/outboxRepository.js";
import { pool } from "../src/config/db.js";
import { ApiResponse } from "../src/utils/ApiResponse.js";

test("ApiResponse stores message and data in the expected fields", () => {
    const response = new ApiResponse(200, "Transaction initiated", { id: "txn-1" });

    assert.equal(response.statusCode, 200);
    assert.equal(response.message, "Transaction initiated");
    assert.deepEqual(response.data, { id: "txn-1" });
    assert.equal(response.success, true);
});

test("createTransaction inserts into transactions with camelCase input values", async () => {
    let capturedQuery;
    let capturedValues;
    const client = {
        async query(query, values) {
            capturedQuery = query;
            capturedValues = values;
            return {
                rows: [{ id: "txn-1", status: "PENDING" }]
            };
        }
    };

    const transaction = await createTransaction(client, {
        id: "txn-1",
        fromAccount: "acct-1",
        toAccount: "acct-2",
        amount: 50,
        idempotencyKey: "idem-1"
    });

    assert.match(capturedQuery, /INSERT INTO transactions/);
    assert.doesNotMatch(capturedQuery, /tranctions/);
    assert.deepEqual(capturedValues, ["txn-1", "acct-1", "acct-2", 50, "idem-1"]);
    assert.deepEqual(transaction, { id: "txn-1", status: "PENDING" });
});

test("ensureTransactionIdempotencyConstraint creates a unique index on idempotency_key", async (t) => {
    const originalQuery = pool.query;
    let capturedQuery;

    pool.query = async (query) => {
        capturedQuery = query;
        return { rows: [] };
    };

    t.after(() => {
        pool.query = originalQuery;
    });

    await ensureTransactionIdempotencyConstraint();

    assert.match(capturedQuery, /CREATE UNIQUE INDEX IF NOT EXISTS/);
    assert.match(capturedQuery, /transactions_idempotency_key_unique/);
    assert.match(capturedQuery, /ON transactions \(idempotency_key\)/);
});

test("fetchPendingOutboxEvents atomically claims events with row locking", async (t) => {
    const originalQuery = pool.query;
    let capturedQuery;
    let capturedValues;

    pool.query = async (query, values) => {
        capturedQuery = query;
        capturedValues = values;
        return {
            rows: [{ id: "event-1", status: "PROCESSING" }]
        };
    };

    t.after(() => {
        pool.query = originalQuery;
    });

    const events = await fetchPendingOutboxEvents(10, 15000);

    assert.match(capturedQuery, /FOR UPDATE SKIP LOCKED/);
    assert.match(capturedQuery, /UPDATE outbox_events/);
    assert.match(capturedQuery, /SET status = 'PROCESSING', locked_at = NOW\(\)/);
    assert.deepEqual(capturedValues, [10, 15000]);
    assert.deepEqual(events, [{ id: "event-1", status: "PROCESSING" }]);
});
