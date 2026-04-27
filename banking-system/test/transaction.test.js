import assert from "node:assert/strict";
import test from "node:test";
import { createTransaction } from "../src/repositories/transactionRepository.js";
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
