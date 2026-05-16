import { pool } from "../config/db.js";

export async function findByIdempotencyKey(key) {
    const res = await pool.query(
        "SELECT * FROM transactions WHERE idempotency_key = $1",
        [key]
    );
    return res.rows[0];
}

export async function createTransaction(client, data) {
    const { id, fromAccount, toAccount, amount, idempotencyKey } = data;
    const res = await client.query(
        `INSERT INTO transactions (id,from_account,to_account,amount,idempotency_key,status)
        VALUES ($1,$2,$3,$4,$5,'PENDING')
        RETURNING *`,
        [id, fromAccount, toAccount, amount, idempotencyKey]
    )
    return res.rows[0];
}
export async function getTransactionById(id){
    const res = await pool.query(
        `SELECT * FROM transaction WHERE id = $1`,[id]
    );
    return res.rows[0];
}
export async function getTransactionByIdForUpdate(client,id){
    const res = await client.query(
        `SELECT * FROM transaction WHERE id = $1 FOR UPDATE`,[id]
    );
    return res.rows[0];
}
export async function updateTransactionStatus(client, id, status, errorMessage = null) {
    const res = await client.query(
        `UPDATE transactions
         SET status = $1,
             error_message = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [status, errorMessage, id]
    );

    return res.rows[0];
}
export async function incrementTransactionRetry(id, errorMessage) {
    const res = await pool.query(
        `UPDATE transactions
         SET retry_count = retry_count + 1,
             error_message = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [errorMessage, id]
    );

    return res.rows[0];
}
export async function markTransactionFailed(id, errorMessage) {
    const res = await pool.query(
        `UPDATE transactions
         SET status = 'FAILED',
             error_message = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [errorMessage, id]
    );

    return res.rows[0];
}
export async function listRecentTransactions(limit = 20) {
    const res = await pool.query(
        `SELECT *
         FROM transactions
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
    );

    return res.rows;
}

export async function ensureTransactionIdempotencyConstraint() {
    await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_key_unique
         ON transactions (idempotency_key)`
    );
}
