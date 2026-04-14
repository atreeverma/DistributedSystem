import { getChannel, QUEUE } from '../config/rabbitmq.js';

async function sendTask(task) {
    const channel = getChannel();
    channel.sentToQueue(
        QUEUE,
        Buffer.from(JSON.stringify(task)),
        { persistent: true }
    )
}
export default { sendTask };