import { pool } from "../config/db.js";
import { v4 as uuidv4 } from "uuid";

export async function createDlqEntry ({transactionId = null,originalMessage,errorReason,retryCount = 0}){
    const res = await pool.query(
        `INSERT INTO dlq (id,transaction_id,original_message,error_reason,retry_count)
        VALUES($1,$2,$3::jsonb,$4,$5) RETURNING *`,[uuidv4(),transactionId,JSON.stringify(originalMessage),errorReason,retryCount]
    );
    return res.rows[0];
}
export async function listDlqEntries(limit = 20){
    const res = await pool.query(
        `SELECT * FROM dlq
        ORDER BY created_at DESC
        LIMIT $1`,[limit]
    );
    return res.rows;
}