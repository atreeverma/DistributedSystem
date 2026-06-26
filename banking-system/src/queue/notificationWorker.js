import amqp from "amqplib"
import "dotenv/config"
import { ApiError } from "../utils/ApiError.js"
import { ensureDatabaseSchema } from "../config/ensureSchema.js"
import {
    NOTIFICATION_DLQ_QUEUE,
    NOTIFICATION_QUEUE,
    NOTIFICATION_RETRY_QUEUE
} from "./producer.js"
import { processNotificationEvent} from "../services/notificationService.services.js"
import { createNotificationDlqEntry } from "../repositories/notificationRepository.js"

const NOTIFICATION_MAX_RETRIES = Number(process.env.NOTIFICATION_MAX_RETRIES) || 3;
const NOTIFICATION_RETRY_DELAY_MS = Number(process.env.NOTIFICATION_RETRY_DELAY_MS) || 5000;

export async function startNotificationWorker() {
    if(!process.env.RABBITMQ_URL) {
        throw new ApiError(500,"RabbitMQ is not configured")
    }
    await ensureDatabaseSchema()

    const connection = await amqp.connect(process.env.RABBITMQ_URL)
    const channel = await connection.createConfirmChannel()
     
    let connectionClosed = false
    const connectionClosedPromise = new Promise((_,reject) => {
        connection.on("close",() => {
            connectionClosed = true,
            reject(new Error("RabbitMq notification worker connection closed"))
        })
        connection.on("error",(error) => {
            if(!connectionClosed){
                reject(error)
            }
        })
    })
    channel.on("error",(error) => {
        console.error(`Notification worker channel error: ${error.message}`)
    })
    await channel.assertQueue(NOTIFICATION_QUEUE,{
        durable: true
    })
    await channel.assertQueue(NOTIFICATION_RETRY_QUEUE, {
        durable: true,
        deadLetterExchange: "",
        deadLetterRoutingKey: NOTIFICATION_QUEUE
    })
    await channel.assertQueue(NOTIFICATION_DLQ_QUEUE, {
        durable: true
    })
    channel.prefetch(5);
    await channel.consume(NOTIFICATION_QUEUE,async (msg) => {
        if(!msg) return

        let payload
        try{
            payload = JSON.parse(msg.content.toString())
        } catch(error){
            console.error(`Invalid Notification payload: ${error.message}`)
            try {
                const originalMessage = {
                    rawMessage: msg.content.toString()
                };

                await createNotificationDlqEntry({
                    transactionId: null,
                    originalMessage,
                    errorReason: "Invalid JSON payload",
                    retryCount: 0
                });

                channel.sendToQueue(
                    NOTIFICATION_DLQ_QUEUE,
                    Buffer.from(JSON.stringify({
                        ...originalMessage,
                        errorReason: "Invalid JSON payload",
                        retryCount: 0
                    })),
                    {
                        persistent: true,
                        contentType: "application/json"
                    }
                );
                await channel.waitForConfirms();
                channel.ack(msg);
            } catch (dlqError) {
                console.error(`Failed to store invalid notification payload in DLQ: ${dlqError.message}`);
                channel.nack(msg,false,true);
            }
            return 
        }
        try{
            await processNotificationEvent(payload)
            channel.ack(msg)

            console.log(
                `Notification event processed for transaction ${payload.transactionId}`
            );
        } catch (error) {
            console.error(`Notification worker failed: ${error.message}`);
            const retryCount = Number(payload?.retryCount || 0);
            const nextRetryCount = retryCount + 1;

            if (nextRetryCount <= NOTIFICATION_MAX_RETRIES) {
                const retryPayload = {
                    ...payload,
                    retryCount: nextRetryCount
                };

                try {
                    channel.sendToQueue(
                        NOTIFICATION_RETRY_QUEUE,
                        Buffer.from(JSON.stringify(retryPayload)),
                        {
                            persistent: true,
                            contentType: "application/json",
                            expiration: String(NOTIFICATION_RETRY_DELAY_MS)
                        }
                    );
                    await channel.waitForConfirms();
                    channel.ack(msg);
                    console.log(
                        `Notification event moved to retry queue. Retry ${nextRetryCount}/${NOTIFICATION_MAX_RETRIES}`
                    );
                } catch (retryPublishError) {
                    console.error(`Failed to publish notification retry: ${retryPublishError.message}`);
                    channel.nack(msg, false, true);
                }

                return;
            }

            try {
                await createNotificationDlqEntry({
                    transactionId: payload?.transactionId || null,
                    originalMessage: payload || {
                        rawMessage: msg.content.toString()
                    },
                    errorReason: error.message,
                    retryCount: nextRetryCount
                });

                channel.sendToQueue(
                    NOTIFICATION_DLQ_QUEUE,
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
                console.log(
                    `Notification event moved to DLQ after ${nextRetryCount} retries`
                );
            } catch (dlqError) {
                console.error(`Failed to move notification event to DLQ: ${dlqError.message}`);
                channel.nack(msg, false, true);
            }
        }
    })
    return connectionClosedPromise;
}
const WORKER_RECONNECT_MS = Number(process.env.WORKER_RECONNECT_MS) || 5000;
async function startNotificationWorkerWithReconnect() {
    while (true) {
        try {
            await startNotificationWorker();
        } catch (error) {
            console.error(
                `Notification worker unavailable, retrying in ${WORKER_RECONNECT_MS}ms: ${error.message}`
            );

            await new Promise((resolve) =>
                setTimeout(resolve, WORKER_RECONNECT_MS)
            );
        }
    }
}

startNotificationWorkerWithReconnect();
