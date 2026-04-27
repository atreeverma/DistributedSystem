import { v4 as uuidv4, v4} from "uuid"
import { pool } from "../config/db.js"
import {
    findByIdempotencyKey,
    createTransaction
} from "../repositories/transactionRepository.js";
import { getAccountById } from "../repositories/accountRepository.js";
export async function initiateTransaction({
    fromAccount,
    toAccount,
    amount,
    idempotencyKey
}) {
    const existing = await findByIdempotencyKey(idempotencyKey)
    if(existing) return existing

    const client = await pool.connect()
    try {
        await client.query("BEGIN")

        const senderRes = await client.query(
            "SELECT * FROM accounts WHERE id = $1 FOR UPDATE",[fromAccount]
        )
        const sender = senderRes.rows[0]
        if(!sender) throw new Error("Sender not found")
        if(sender.balance < amount) throw new Error("Insufficient balance")
        
        const receiver = await getAccountById(client,toAccount)
        if(!receiver) throw new Error("Receiver not found")
        
        // 💸 Debit sender account
        await client.query(
            "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
            [amount, fromAccount]
        )

        // 💰 Credit receiver account
        await client.query(
            "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
            [amount, toAccount]
        )
        
        const transaction = await createTransaction(client,{
            id: v4(),
            fromAccount,
            toAccount,
            amount,
            idempotencyKey
        })
        await client.query("COMMIT")

        return transaction
        
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally{
        client.release()
    }
}