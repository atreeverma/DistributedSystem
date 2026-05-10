import express from "express";
import dotenv from "dotenv";
import transactionRoutes from "./routes/transactionRoutes.routes.js";
import { ApiResponse } from "./utils/ApiResponse.js";
import { connectQueue } from "./queue/producer.js";
import { startOutboxDispatcher } from "./queue/outboxDispatcher.js";
import { ensureOutboxTable } from "./repositories/outboxRepository.js";
import { ensureTransactionIdempotencyConstraint } from "./repositories/transactionRepository.js";

dotenv.config();

const app = express();
const QUEUE_RETRY_INTERVAL_MS = Number(process.env.QUEUE_RETRY_INTERVAL_MS) || 5000;

// Middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api", transactionRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json(new ApiResponse(404, "Route not found", null));
});

// Global Error Handler
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(`Error: ${message}`);
    res.status(statusCode).json(new ApiResponse(statusCode, message, null));
});

async function startQueueServices() {
    try {
        await connectQueue();
        startOutboxDispatcher();
    } catch (error) {
        console.error(`RabbitMQ unavailable, retrying in ${QUEUE_RETRY_INTERVAL_MS}ms: ${error.message}`);
        setTimeout(startQueueServices, QUEUE_RETRY_INTERVAL_MS);
    }
}

async function startServer() {
    const PORT = process.env.PORT || 3000;

    if (!PORT) {
        console.error("PORT not defined in .env");
        process.exit(1);
    }

    await ensureOutboxTable();
    await ensureTransactionIdempotencyConstraint();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    startQueueServices();
}

startServer().catch((error) => {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
});
