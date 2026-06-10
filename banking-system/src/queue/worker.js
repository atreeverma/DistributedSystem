import amqp from "amqplib"
import { processWalletTransfer } from "../services/walletService.services.js"
import "dotenv/config"
import { QUEUE_NAME,RETRY_QUEUE,DLQ_QUEUE } from "./producer.js"
import { ApiError } from "../utils/ApiError.js"
import { incrementTransactionRetry,markTransactionFailed } from "../repositories/transactionRepository.js"
import { createDlqEntry } from "../repositories/dlqRepository.js"
import { ensureDatabaseSchema } from "../config/ensureSchema.js"
import { createOutboxEvent } from "../repositories/outboxRepository.js";
import { pool } from "../config/db.js";
import { createAuditLog } from "../repositories/auditRepository.js";

const MAX_RETRIES = Number(process.env.MAX_RETRIES) || 3
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS) || 5000
function isPermanentError(error) {
    return [400, 404, 409].includes(error.statusCode);
}
async function moveMessageToDlq({
    channel,
    msg,
    payload,
    errorReason,
    retryCount = 0,
    transactionId = null
}) {
    const originalMessage = payload || {
        rawMessage: msg.content.toString()
    };

    try {
        await createDlqEntry({
            transactionId,
            originalMessage,
            errorReason,
            retryCount
        });

        channel.sendToQueue(
            DLQ_QUEUE,
            Buffer.from(JSON.stringify({
                ...originalMessage,
                errorReason,
                retryCount
            })),
            {
                persistent: true,
                contentType: "application/json"
            }
        );

        await channel.waitForConfirms();
        channel.ack(msg);

        console.log(`Message moved to DLQ: ${errorReason}`);
    } catch (error) {
        console.error(`Failed to move message to DLQ: ${error.message}`);
        channel.nack(msg, false, true);
    }
}
export async function startWorker(){
    if(!process.env.RABBITMQ_URL){
        throw new ApiError(500,"RabbitMQ is not configured")
    }

    await ensureDatabaseSchema();

    const connection = await amqp.connect(process.env.RABBITMQ_URL)
    let connectionClosed = false;

    const connectionClosedPromise = new Promise((_, reject) => {
        connection.on("close", () => {
            connectionClosed = true;
            reject(new Error("RabbitMQ connection closed"));
        });

        connection.on("error", (error) => {
            if (!connectionClosed) {
                reject(error);
            }
        });
    });
    const channel = await connection.createConfirmChannel()
    await channel.assertQueue(QUEUE_NAME, {
        durable: true
    });
    await channel.assertQueue(RETRY_QUEUE, {
        durable: true,
        deadLetterExchange: "",
        deadLetterRoutingKey: QUEUE_NAME
    });

    await channel.assertQueue(DLQ_QUEUE, {
        durable: true
    });
    channel.prefetch(1);
    channel.consume(QUEUE_NAME,async (msg) => {
        if(!msg){
            return ;
        }
        let payload
        try {
            payload = JSON.parse(msg.content.toString());
        } catch (error) {
            await moveMessageToDlq({
                channel,
                msg,
                payload: null,
                errorReason: "Invalid JSON payload",
                retryCount: 0,
                transactionId: null
            });

            return;
        }

        const { transactionId } = payload;

        if (!transactionId) {
            await moveMessageToDlq({
                channel,
                msg,
                payload,
                errorReason: "transactionId missing in message payload",
                retryCount: Number(payload.retryCount || 0),
                transactionId: null
            });

            return;
        }

        try {
            await processWalletTransfer(transactionId);

            channel.ack(msg);

            console.log(`Transaction processed successfully: ${transactionId}`);
        } catch (error) {
            console.error(`Worker failed to process message: ${error.message}`);
            const retryCount = Number(payload?.retryCount || 0)
            const nextRetryCount = retryCount + 1;
            const transactionId = payload?.transactionId

            if(transactionId && !isPermanentError(error) && nextRetryCount <= MAX_RETRIES){
                const retryPayload = {
                    ...payload,
                    retryCount: nextRetryCount
                };

                try {
                    await incrementTransactionRetry(transactionId, error.message);
                    await createAuditLog(null,{
                        transactionId,
                        actor: "worker",
                        action: "TRANSFER_RETRY_SCHEDULED",
                        status: "RETRY",
                        metadata: {
                            retryCount: nextRetryCount,
                            maxRetries: MAX_RETRIES,
                            errorMessage: error.message
                        }
                    })
                    channel.sendToQueue(
                        RETRY_QUEUE,
                        Buffer.from(JSON.stringify(retryPayload)),
                        {
                            persistent: true,
                            contentType: "application/json",
                            expiration: String(RETRY_DELAY_MS)
                        }
                    );
                    await channel.waitForConfirms();
                    channel.ack(msg);
                    console.log(
                        `Transaction ${transactionId} moved to retry queue. Retry ${nextRetryCount}/${MAX_RETRIES}`
                    );
                } catch (publishError) {
                    console.error(
                        `Failed to publish retry for ${transactionId}: ${publishError.message}`
                    );
                    channel.nack(msg, false, true);
                }

                return;
            }

            try {
                let failedTransaction = null
                if (transactionId) {
                    failedTransaction = await markTransactionFailed(transactionId, error.message);
                    await createAuditLog(null, {
                        transactionId,
                        actor: "worker",
                        action: "TRANSFER_FAILED",
                        status: "FAILED",
                        metadata: {
                            retryCount: nextRetryCount,
                            errorMessage: error.message
                        }
                    });
                }
                if(failedTransaction){
                    const client = await pool.connect()
                    try {
                        await client.query("BEGIN")

                        await createOutboxEvent(client,{
                            eventType: "TRANSACTION_FAILED",
                            aggregateId: failedTransaction.id,
                            payload: {
                                eventType: "TRANSACTION_FAILED",
                                transactionId: failedTransaction.id,
                                fromAccount: failedTransaction.from_account,
                                toAccount: failedTransaction.to_account,
                                amount: Number(failedTransaction.amount),
                                errorMessage: error.message
                            }
                        })
                        await client.query("COMMIT")
                    } catch (error) {
                        await client.query("ROLLBACK")
                        throw error
                    }finally {
                        client.release();
                    }
                }
                await createDlqEntry({
                    transactionId: transactionId || null,
                    originalMessage: payload || {
                        rawMessage: msg.content.toString()
                    },
                    errorReason: error.message,
                    retryCount: nextRetryCount
                });
                await createAuditLog(null, {
                    transactionId: transactionId || null,
                    actor: "worker",
                    action: "MOVED_TO_DLQ",
                    status: "FAILED",
                    metadata: {
                        retryCount: nextRetryCount,
                        errorMessage: error.message,
                        originalMessage: payload || {
                            rawMessage: msg.content.toString()
                        }
                    }
                });
                channel.sendToQueue(
                    DLQ_QUEUE,
                    Buffer.from(JSON.stringify({
                        ...(payload || {}),
                        errorReason: error.message,
                        retryCount: nextRetryCount
                    })),
                    {
                        persistent: true,
                        contentType: "application/json"
                    }
                );
                await channel.waitForConfirms();
                channel.ack(msg);
                console.log(`Message moved to DLQ after ${nextRetryCount} retries`);
            } catch (publishError) {
                console.error(`Failed to publish to DLQ: ${publishError.message}`);
                channel.nack(msg, false, true);
            }
        }
    })
    return connectionClosedPromise;
}
const WORKER_RECONNECT_MS = Number(process.env.WORKER_RECONNECT_MS) || 5000;

async function startWorkerWithReconnect() {
    while (true) {
        try {
            await startWorker();
            return;
        } catch (error) {
            console.error(`Worker unavailable, retrying in ${WORKER_RECONNECT_MS}ms: ${error.message}`);
            await new Promise((resolve) => setTimeout(resolve, WORKER_RECONNECT_MS));
        }
    }
}

startWorkerWithReconnect();