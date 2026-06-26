import amqp from "amqplib";
import { once } from "node:events";
import { ApiError } from "../utils/ApiError.js";

export const QUEUE_NAME = "transaction_queue";
export const RETRY_QUEUE = "transaction_retry_queue"
export const DLQ_QUEUE = "transaction_dlq_queue"
export const NOTIFICATION_QUEUE = "notification_queue"
export const NOTIFICATION_RETRY_QUEUE = "notification_retry_queue"
export const NOTIFICATION_DLQ_QUEUE = "notification_dlq_queue"
let connection;
let channel;

export async function connectQueue() {
    if (!process.env.RABBITMQ_URL) {
        throw new ApiError(500, "RABBITMQ_URL is not configured");
    }

    if (channel) {
        return;
    }

    connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createConfirmChannel();

    connection.on("close", () => {
        connection = undefined;
        channel = undefined;
    });
    await channel.assertQueue(QUEUE_NAME, {
        durable: true
    });
    await channel.assertQueue(RETRY_QUEUE,{
        durable: true,
        deadLetterExchange: "",
        deadLetterRoutingKey: QUEUE_NAME 
    })
    await channel.assertQueue(DLQ_QUEUE,{
        durable: true
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
    console.log("RabbitMQ connected");
}

export async function publishTransaction(data) {
    if (!channel) {
        throw new ApiError(500, "RabbitMQ not connected");
    }

    const canWrite = channel.sendToQueue(
        QUEUE_NAME,
        Buffer.from(JSON.stringify(data)),
        {
            persistent: true,
            contentType: "application/json"
        }
    );

    if (!canWrite) {
        await once(channel, "drain");
    }

    await channel.waitForConfirms();

    console.log("Transaction pushed to queue");
}
export async function publishNotification(data) {
    if(!channel) {
        throw new ApiError(500,"RabbitMq not connected")
    }

    const canWrite = channel.sendToQueue(
        NOTIFICATION_QUEUE,
        Buffer.from(JSON.stringify(data)),
        {
            persistent: true,
            contentType: "application/json"
        }
    )
    if(!canWrite) {
        await once(channel,"drain");
    }
    await channel.waitForConfirms()

    console.log("Notification pushed to queue");
}
