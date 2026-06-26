import express from "express";
import dotenv from "dotenv";
import transactionRoutes from "./routes/transactionRoutes.routes.js";
import walletRoutes from "./routes/walletRoutes.routes.js"
import { ApiResponse } from "./utils/ApiResponse.js";
import { connectQueue } from "./queue/producer.js";
import { startOutboxDispatcher } from "./queue/outboxDispatcher.js";
import { ensureDatabaseSchema } from "./config/ensureSchema.js";

dotenv.config();//it will load the environment variables from the .env file

const app = express();
const QUEUE_RETRY_INTERVAL_MS = Number(process.env.QUEUE_RETRY_INTERVAL_MS) || 5000;//used to retry the queue connection if it fails

// Middleware
app.use((req, res, next) => {//it will log the request method and path
    console.log(`${req.method} ${req.path}`);
    next();
});

app.use(express.json({ limit: "10mb" }));//it will limit the size of the request body to 10mb
//healthcheck
app.get("/health", (req, res) => {//helps to check api is alive without touching database logic
    res.status(200).json(
        new ApiResponse(200, "OK", {
            status: "healthy"
        })
    );
});

// Routes
app.use("/api", transactionRoutes); //it will use the transactionRoutes middleware for the /api route
app.use("/api",walletRoutes);
// 404 Handler
app.use((req, res) => { //it will return a 404 error if the route is not found
    res.status(404).json(new ApiResponse(404, "Route not found", null));
});

// Global Error Handler
app.use((err, req, res, next) => { //it will handle the errors
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`Error: ${message}`);
    res.status(statusCode).json(new ApiResponse(statusCode, message, null));
});//Express only invokes 4-argument (err, req, res, next) handlers when an error is passed to next()

async function startQueueServices() { //it will start the queue services
    try {
        await connectQueue();
        startOutboxDispatcher();
    } catch (error) {
        console.error(`RabbitMQ unavailable, retrying in ${QUEUE_RETRY_INTERVAL_MS}ms: ${error.message}`);
        setTimeout(startQueueServices, QUEUE_RETRY_INTERVAL_MS);
    }
}

async function startServer() { //it will start the server
    const PORT = process.env.PORT || 3000;

    if (!PORT) {
        console.error("PORT not defined in .env");
        process.exit(1);//it will exit the process with a status code of 1
    }

    await ensureDatabaseSchema();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    startQueueServices();
}

startServer().catch((error) => {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
});
