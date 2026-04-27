import { pool } from "../config/db.js";

export async function findByIdempotencyKey(key) {
    const res = await pool.query(
        "SELECT * FROM transactions WHERE idempotency_key = $1",
        [key]
    );
    return res.rows[0];
}

export async function createTransaction(client,data) {
    const {id,from_account,to_account,amount,idempotency_key} = data;
    const res = await client.query(
        `INSERT INTO tranctions (id,from_account,to_account,amount,idempotency_key,status)
        VALUES ($1,$2,$3,$4,$5,'PENDING')
        RETURNING *`,
        [id,from_account,to_account,amount,idempotency_key]
    )
    return res.rows[0];
}