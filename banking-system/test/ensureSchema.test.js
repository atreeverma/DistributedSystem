import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../src/config/db.js";
import { ensureDatabaseSchema } from "../src/config/ensureSchema.js";

test("ensureDatabaseSchema executes schema.sql against the database pool", async (t) => {
    const originalQuery = pool.query;
    let capturedQuery;

    pool.query = async (query) => {
        capturedQuery = query;
        return { rows: [] };
    };

    t.after(() => {
        pool.query = originalQuery;
    });

    await ensureDatabaseSchema();

    assert.match(capturedQuery, /CREATE TABLE IF NOT EXISTS accounts/);
    assert.match(capturedQuery, /CREATE TABLE IF NOT EXISTS transactions/);
    assert.match(capturedQuery, /CREATE TABLE IF NOT EXISTS dlq/);
});
