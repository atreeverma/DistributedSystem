import { connectQueue,getChannel,QUEUE } from "../config/rabbitmq"
async function startWorker() {
    await connectQueue()

    const channel = getChannel()

    
}