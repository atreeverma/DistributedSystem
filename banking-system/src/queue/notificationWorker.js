import amqp from "amqplib"
import "dotenv/config"
import { ApiError } from "../utils/ApiError.js"
import { ensureDatabaseSchema } from "../config/ensureSchema.js"
import { NOTIFICATION_QUEUE } from "./producer.js"
import { processNotificationEvent} from "../services/notificationService.services.js"

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
    channel.prefetch(5);
    await channel.consume(NOTIFICATION_QUEUE,async (msg) => {
        if(!msg) return

        let payload
        try{
            payload = JSON.parse(msg.content.toString())
        } catch(error){
            console.error(`Invalid Notification payload: ${error.message}`)
            channel.nack(msg,false,false);
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
            channel.nack(msg, false, true);
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