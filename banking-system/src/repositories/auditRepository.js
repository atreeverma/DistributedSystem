import { v4 as uuidv4 } from "uuid";
import { pool } from "../config/db.js"

export async function createAuditLog(client,{
    transactionId = null,
    actor = "system",
    action,
    status,
    metadata = {}
}){
    const executor = client || pool

    const res = await executor.query(
        `INSERT INTO audit_logs (id,transaction_id,actor,action,status,metadata)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
        [uuidv4(), transactionId, actor, action, status, JSON.stringify(metadata)]
    )
    return res.rows[0];
}
export async function listAuditLogs(limit = 20) {
    const safeLimit = Math.min(Number(limit) || 20,100)

    const res = await pool.query(
        `SELECT * FROM audit_logs
        ORDER BY created_at DESC
        LIMIT $1`,[safeLimit]
    )
    return res.rows;
}
export async function listAuditLogsByTransaction(transactionId,limit = 20) {
    const safeLimit = Math.min(Number(limit) || 20,100)

    const res = await pool.query(
        `SELECT * FROM audit_logs
        WHERE transaction_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,[transactionId,safeLimit]
    )
    return res.rows;
}
export async function listAuditLogsByAction(action,limit = 20) {
    const safeLimit = Math.min(Number(limit) || 20,100)

    const res = await pool.query(
        `SELECT * FROM audit_logs
        WHERE action = $1
        ORDER BY created_at DESC
        LIMIT $2`,[action,safeLimit]
    )
    return res.rows;
}
