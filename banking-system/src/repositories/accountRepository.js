import { pool } from "../config/db.js";
export async function createAccount({id,initialBalance = 0}){
    const res = await pool.query(
        `INSERT INTO accounts (id,balance)
        VALUES ($1,$2) RETURNING*`,[id,initialBalance]
    );
    return res.rows[0];
}
export async function getAccountById({client, id}) {
    const res = await client.query(
        `SELECT * FROM accounts WHERE id = $1`,
        [id]
    );
    return res.rows[0];
}
export async function getAccountsForUpdate({client,fromAccount,toAccount}){
    const res = await client.query(
        `SELECT * FROM accounts 
            WHERE id IN ($1,$2) 
            ORDER BY id
            FOR UPDATE`,[fromAccount,toAccount]
    );
return res.rows[0];
}
export async function updateAccountBalance({client,accountId,amount}){
    const res = await client.query(
        `UPDATE accounts
        SET balance = balance + $1
            updated_at = NOW()
        WHERE id = $2
        RETURNING *`,[amount,accountId]
    );
    return res.rows[0];
}