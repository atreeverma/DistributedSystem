import { pool } from "../config/db.js";
import { createAccount } from "../repositories/accountRepository.js";
import { getAccountById } from "../repositories/accountRepository.js";
import { ApiError } from "../utils/ApiError.js"
import { getTransactionByIdForUpdate, updateTransactionStatus } from "../repositories/transactionRepository.js"
import { getAccountsForUpdate } from "../repositories/accountRepository.js"
import { updateAccountBalance } from "../repositories/accountRepository.js";
import { createOutboxEvent } from "../repositories/outboxRepository.js";

export async function createWallet({userId,initialBalance = 0}) {
    if(!userId) throw new ApiError(400,"User Id is required")
    
    const balance = Number(initialBalance)
    if(!Number.isFinite(balance) || balance < 0) throw new ApiError(400,"Initial balance cannot be negative");

    const wallet = await createAccount({id: userId,initialBalance: balance});
    return wallet;
}

export async function getWallet(userId){
    if(!userId) throw new ApiError(400,"User id is required")

    const wallet = await getAccountById(pool,userId);
    if(!wallet) throw new ApiError(404,"Wallet not found");
    return wallet;
}

export async function processWalletTransfer(transactionId) {
    const client = await pool.connect();

    try{
        await client.query("BEGIN")
        const transaction = await getTransactionByIdForUpdate(client,transactionId)
        if(!transaction) throw new ApiError(404,"Transaction not found")
        
        if(transaction.status === "SUCCESS") {
            await client.query("COMMIT")
            return transaction
        }
        if(transaction.status === "FAILED"){
            throw new ApiError(409,"Transaction already failed")
        }

        const accounts = await getAccountsForUpdate(client,transaction.from_account,transaction.to_account)

        const sender = accounts.find(
            (account) => account.id === transaction.from_account
        )
        const receiver = accounts.find(
            (account) => account.id === transaction.to_account
        )
        if(!sender) throw new ApiError(404,"Sender not found")
        if(!receiver) throw new ApiError(404,"Receiver not found")
        
        const amountDelta = Number(transaction.amount)
        if(Number(sender.balance) < amountDelta) throw new ApiError(400,"Insufficient balance")

        await updateAccountBalance(client,sender.id,-amountDelta)
        await updateAccountBalance(client,receiver.id,amountDelta)

        const updatedTransaction = await updateTransactionStatus(
            client,
            transaction.id,
            "SUCCESS"
        )
        await createOutboxEvent(client, {
            eventType: "TRANSACTION_SUCCEEDED",
            aggregateId: transaction.id,
            payload: {
                eventType: "TRANSACTION_SUCCEEDED",
                transactionId: transaction.id,
                fromAccount: transaction.from_account,
                toAccount: transaction.to_account,
                amount: Number(transaction.amount)
            }
        });
        await client.query("COMMIT")
        return updatedTransaction
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally {
        client.release()
    }
}
