import express from "express"
import { connectQueue } from "./config/rabbitmq"
import taskRoutes from "./routes/taskRoutes"

const app = express();
app.use(express.json());

app.use('/api',taskRoutes)
async function startServer() {
    await connectQueue()

    app.listen(3000, () => {
        console.log("Server running on port 3000");
    })
}
startServer()
