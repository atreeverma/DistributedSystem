import { pool } from "../config/db.js";
import { v4 as uuidv4 } from "uuid";
export async function createNotification({transactionId,recipientAccount,notificationType,payload}){
    const res = await pool.query(
        `INSERT INTO notifications(id,transaction_id,recipient_account,notification_type,status,payload)
        VALUES($1,$2,$3,$4,'PENDING',$5::jsonb) RETURNING *`,[uuidv4(),
            transactionId,
            recipientAccount,
            notificationType,
            JSON.stringify(payload)
        ]
    )
    return res.rows[0];
}
export async function markNotificationSent(id){
    const res = await pool.query(
        `UPDATE notifications
        SET status = 'SENT',
            sent_at = NOW(),
            error_message = NULL
        WHERE id = $1
        RETURNING *`,[id]
    )
    return res.rows[0];
}
export async function markNotificationFailed(id,errorMessage){
    const res = await pool.query(
        `UPDATE notifications
        SET status = 'FAILED',
            error_message = $2
        WHERE id = $1
        RETURNING *`,[id,errorMessage]
    )
    return res.rows[0];
}
export async function listNotifications(limit = 20) {
    const safeLimit = Math.min(Number(limit) || 20, 100);

    const res = await pool.query(
        `SELECT *
         FROM notifications
         ORDER BY created_at DESC
         LIMIT $1`,
        [safeLimit]
    );

    return res.rows;
}
export async function listNotificationsByTransaction(transactionId,limit = 20){
    const safeLimit = Math.min(Number(limit) || 20,100)

    const res = await pool.query(
        `SELECT * FROM notifications
        WHERE transaction_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,[transactionId,safeLimit]
    )
    return res.rows;
}