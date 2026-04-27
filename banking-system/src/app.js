import express from "express";
import dotenv from "dotenv";
import transactionRoutes from "./routes/transactionRoutes.routes.js";
import { ApiResponse } from "./utils/ApiResponse.js";

dotenv.config();

const app = express();

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

// Start Server
const PORT = process.env.PORT || 3000;

if (!PORT) {
    console.error("PORT not defined in .env");
    process.exit(1);
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});