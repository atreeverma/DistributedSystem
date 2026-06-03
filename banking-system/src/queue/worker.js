import amqp from "amqplib"
import { processWalletTransfer } from "../services/walletService.services.js"
import "dotenv/config"
import { QUEUE_NAME,RETRY_QUEUE,DLQ_QUEUE } from "./producer.js"
import { ApiError } from "../utils/ApiError.js"
import { incrementTransactionRetry,markTransactionFailed } from "../repositories/transactionRepository.js"
import { createDlqEntry } from "../repositories/dlqRepository.js"
const MAX_RETRIES = Number(process.env.MAX_RETRIES) || 3
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS) || 5000
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
}
export async function startWorker(){
    if(!process.env.RABBITMQ_URL){
        throw new ApiError(500,"RabbitMQ is not configured")
    }
    const connection = await amqp.connect(process.env.RABBITMQ_URL)
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

            if(transactionId && nextRetryCount <= MAX_RETRIES){
                const retryPayload = {
                    ...payload,
                    retryCount: nextRetryCount
                }
                await incrementTransactionRetry(transactionId,error.message)
                channel.sendToQueue(
                    RETRY_QUEUE,
                    Buffer.from(JSON.stringify(retryPayload)),
                    {
                        persistent: true,
                        contentType: "application/json",
                        expiration: String(RETRY_DELAY_MS)
                    }
                )
                await channel.waitForConfirms()
                channel.ack(msg)
                console.log(
                    `Transaction ${transactionId} moved to retry queue. Retry ${nextRetryCount}/${MAX_RETRIES}`
                );

                return;
            }
            if(transactionId){
                await markTransactionFailed(transactionId,error.message)
            }
            await createDlqEntry({
                transactionId: transactionId || null,
                originalMessage: payload || {
                    rawMessage: msg.content.toString()
                },
                errorReason: error.message,
                retryCount
            })
            channel.sendToQueue(
                DLQ_QUEUE,
                Buffer.from(JSON.stringify({
                    ...(payload || {}),
                    errorReason: error.message,
                    retryCount
                })),
                {
                    persistent: true,
                    contentType: "application/json"
                }
            )
            await channel.waitForConfirms()
            channel.ack(msg)
            console.log(`Message moved to DLQ after ${retryCount} retries`);
            
        }
    })
}
startWorker().catch((error) => {
    console.error(`Failed to start worker: ${error.message}`);
    process.exit(1);
});