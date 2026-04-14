import { sendTask } from '../queue/producer.js';

async function createTask(req,res) {
    const task = {
        type: "email",
        payload: req.body
    }
    await sendTask(task);
    res.json({ message: 'Task created and sent to the queue' });
}
export default { createTask };