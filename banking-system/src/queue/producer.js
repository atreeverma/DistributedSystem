import amqp from "amqplib";
import { once } from "node:events";
import { ApiError } from "../utils/ApiError.js";

const QUEUE_NAME = "transaction_queue";

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

    channel.on("close", () => {
        channel = undefined;
    });

    await channel.assertQueue(QUEUE_NAME, {
        durable: true
    });

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
