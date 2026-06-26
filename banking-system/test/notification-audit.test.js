import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/config/db.js";
import {
    createNotification,
    markNotificationSent,
    markNotificationFailed,
    listNotificationsByTransaction
} from "../src/repositories/notificationRepository.js";
import {
    createAuditLog,
    listAuditLogsByTransaction,
    listAuditLogsByAction
} from "../src/repositories/auditRepository.js";

test("createNotification inserts notification with expected values", async (t) => {
    const originalQuery = pool.query;
    let capturedQuery;
    let capturedValues;

    pool.query = async (query, values) => {
        capturedQuery = query;
        capturedValues = values;
        return {
            rows: [{
                id: "notification-1",
                transaction_id: "tx-1",
                recipient_account: "scaler",
                notification_type: "TRANSFER_DEBITED",
                status: "PENDING"
            }]
        };
    };

    t.after(() => {
        pool.query = originalQuery;
    });

    const notification = await createNotification({
        transactionId: "tx-1",
        recipientAccount: "scaler",
        notificationType: "TRANSFER_DEBITED",
        payload: { amount: 500 }
    });

    assert.match(capturedQuery, /INSERT INTO notifications/);
    assert.equal(capturedValues[1], "tx-1");
    assert.equal(capturedValues[2], "scaler");
    assert.equal(capturedValues[3], "TRANSFER_DEBITED");
    assert.equal(capturedValues[4], JSON.stringify({ amount: 500 }));
    assert.equal(notification.status, "PENDING");
});

test("notification repository updates sent and failed status", async (t) => {
    const originalQuery = pool.query;
    const queries = [];

    pool.query = async (query, values) => {
        queries.push({ query, values });

        if (query.includes("status = 'SENT'")) {
            return {
                rows: [{
                    id: values[0],
                    status: "SENT"
                }]
            };
        }

        return {
            rows: [{
                id: values[0],
                status: "FAILED",
                error_message: values[1]
            }]
        };
    };

    t.after(() => {
        pool.query = originalQuery;
    });

    const sent = await markNotificationSent("notification-1");
    const failed = await markNotificationFailed("notification-2", "webhook failed");

    assert.equal(sent.status, "SENT");
    assert.equal(failed.status, "FAILED");
    assert.equal(failed.error_message, "webhook failed");
    assert.match(queries[0].query, /UPDATE notifications/);
    assert.match(queries[1].query, /UPDATE notifications/);
});

test("createAuditLog inserts structured audit metadata", async (t) => {
    const client = {
        async query(query, values) {
            return {
                rows: [{
                    id: "audit-1",
                    transaction_id: values[1],
                    actor: values[2],
                    action: values[3],
                    status: values[4],
                    metadata: JSON.parse(values[5])
                }]
            };
        }
    };

    const auditLog = await createAuditLog(client, {
        transactionId: "tx-1",
        actor: "worker",
        action: "TRANSFER_SUCCEEDED",
        status: "SUCCESS",
        metadata: {
            amount: 500,
            fromAccount: "scaler",
            toAccount: "bhm"
        }
    });

    assert.equal(auditLog.transaction_id, "tx-1");
    assert.equal(auditLog.actor, "worker");
    assert.equal(auditLog.action, "TRANSFER_SUCCEEDED");
    assert.equal(auditLog.status, "SUCCESS");
    assert.deepEqual(auditLog.metadata, {
        amount: 500,
        fromAccount: "scaler",
        toAccount: "bhm"
    });
});