import { v4 as uuidv4 } from "uuid"
import { pool } from "../config/db.js"
import { ApiError } from "../utils/ApiError.js";
import {
    findByIdempotencyKey,
    createTransaction,getTransactionById
} from "../repositories/transactionRepository.js";
import { getAccountById } from "../repositories/accountRepository.js";
import { createOutboxEvent } from "../repositories/outboxRepository.js";
import { listRecentTransactions } from "../repositories/transactionRepository.js";
export async function initiateTransaction({
    fromAccount,
    toAccount,
    amount,
    idempotencyKey
}) {
    if (fromAccount === toAccount) {
        throw new ApiError(400, "Sender and receiver accounts cannot be same")
    }
    const transferAmount = Number(amount);

    if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
        throw new ApiError(400, "Amount must be greater than zero");
    }
    const existing = await findByIdempotencyKey(idempotencyKey)
    if(existing) return existing

    const client = await pool.connect()
    try {
        await client.query("BEGIN")

        const sender = await getAccountById(client, fromAccount);
        if(!sender) throw new ApiError(404,"Sender not found")
        if(Number(sender.balance) < transferAmount) throw new ApiError(400,"Insufficient balance")
        
        const receiver = await getAccountById(client,toAccount)
        if(!receiver) throw new ApiError(404,"Receiver not found")
        
        const transaction = await createTransaction(client,{
            id: uuidv4(),
            fromAccount,
            toAccount,
            amount: transferAmount,
            idempotencyKey
        })

        await createOutboxEvent(client, {
            eventType: "TRANSACTION_CREATED",
            aggregateId: transaction.id,
            payload: {
                eventType: "TRANSACTION_CREATED",
                transactionId: transaction.id,
                fromAccount,
                toAccount,
                amount: transferAmount
            }
        });

        await client.query("COMMIT")
        return transaction
    } catch (error) {
        await client.query("ROLLBACK")

        if (error.code === "23505") {
            const existing = await findByIdempotencyKey(idempotencyKey)
            if(existing) return existing
        }

        throw new ApiError(error.statusCode || 500, error.message || "Transaction failed")
    } finally{
        client.release()
    }
}
export async function getTransactionStatus(id){
    const transaction = await getTransactionById(id)
    if(!transaction) throw new ApiError(404,"Transaction Not found")
    return transaction
}
export async function getRecentTransactions(limit = 20){
    const safeLimit = Math.min(Number(limit) || 20,100)
    return listRecentTransactions(safeLimit)
}
