import express from "express";

const app = express();

app.use(express.json());

app.post("/notifications", (req, res) => {
    console.log("Webhook notification received:");
    console.log(JSON.stringify(req.body, null, 2));

    return res.status(200).json({
        success: true,
        message: "Notification received"
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "webhook receiver healthy"
    });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`Webhook receiver running on port ${PORT}`);
});