import {
    listNotificationDlqEntries,
    listNotifications,
    listNotificationsByTransaction
} from "../repositories/notificationRepository.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export async function listNotificationsController(req, res) {
    const { transactionId, limit } = req.query;

    const notifications = transactionId
        ? await listNotificationsByTransaction(transactionId, limit)
        : await listNotifications(limit);

    return res.status(200).json(
        new ApiResponse(200, "Notifications fetched", {
            count: notifications.length,
            notifications
        })
    );
}

export async function listNotificationDlqController(req, res) {
    const messages = await listNotificationDlqEntries(req.query.limit);

    return res.status(200).json(
        new ApiResponse(200, "Notification dead letter queue fetched", {
            count: messages.length,
            messages
        })
    );
}
