import { connect } from 'amqplib';
const QUEUE = 'task_queue';
let channel;

async function connectQueue() {
  const connection = await connect('amqp://localhost');
  channel = await connection.createChannel();

  await channel.assertQueue(QUEUE, { durable: true });
}

function getChannel() {
  return channel;
}

export default { connectQueue, getChannel, QUEUE };