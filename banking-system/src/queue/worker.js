import amqp from "amqplib"
import { processWalletTransfer } from "../services/walletService.services.js"
import "dotenv/config"
import { QUEUE_NAME } from "./producer.js"
import { ApiError } from "../utils/ApiError.js"
export async function startWorker(){
    if(!process.env.RABBITMQ_URL){
        throw new ApiError(500,"RabbitMQ is not configured")
    }
    const connection = await amqp.connect(process.env.RABBITMQ_URL)
    const channel = await connection.createChannel()
    await channel.assertQueue(QUEUE_NAME, {
        durable: true
    });
    channel.prefetch(1);
    channel.consume(QUEUE_NAME,async (msg) => {
        if(!msg){
            return ;
        }
        try {
            const payload = JSON.parse(msg.content.toString()) 
            const { transactionId } = payload
            if(!transactionId) {
                throw new ApiError(400,"Transaction Id is missing in payload")
            }
            await processWalletTransfer(transactionId)
            channel.ack(msg)
            console.log(`Transaction processed successfully: ${transactionId}`);
        } catch (error) {
            console.error(`Worker failed to process message: ${error.message}`);
            channel.nack(msg, false, true);
        }
    })
}
startWorker().catch((error) => {
    console.error(`Failed to start worker: ${error.message}`);
    process.exit(1);
});