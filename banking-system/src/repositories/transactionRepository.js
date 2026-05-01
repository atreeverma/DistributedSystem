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

export async function updateTransactionStatus(id, status) {
    const res = await pool.query(
        `UPDATE transactions
         SET status = $1
         WHERE id = $2
         RETURNING *`,
        [status, id]
    );
    return res.rows[0];
}

export async function ensureTransactionIdempotencyConstraint() {
    await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_key_unique
         ON transactions (idempotency_key)`
    );
}
