import {
    createNotification,
    markNotificationFailed,
    markNotificationSent
} from "../repositories/notificationRepository.js"
import { createAuditLog } from "../repositories/auditRepository.js";

function buildNotificationTargets(event) {
    const {eventType,transactionId,fromAccount,toAccount,amount,errorMessage} = event;
    if(eventType === "TRANSACTION_SUCCEEDED"){
        return [
            {
                recipientAccount: fromAccount,
                notificationType: "TRANSFER_DEBITED",
                payload: {
                    transactionId,
                    amount,
                    message: `Transfer of ${amount} debited successfully`
                }
            },
            {
                recipientAccount: toAccount,
                notificationType: "TRANSFER_CREDITED",
                payload: {
                    transactionId,
                    amount,
                    message: `Transfer of ${amount} credited successfully`
                }
            }
        ]
    }
    if(eventType === "TRANSACTION_FAILED")
    {
        return [
            {
                recipientAccount: fromAccount,
                notificationType: "TRANSFER_FAILED",
                payload: {
                    transactionId,
                    amount,
                    errorMessage,
                    message: `Transfer failed`
                }
            }
        ]
    }
    return [];
}
async function sendNotification(notification) {
    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL

    const notificationPayload = {
        notificationId: notification.id,
        transactionId: notification.transaction_id,
        recipientAccount: notification.recipient_account,
        notificationType: notification.notification_type,
        payload: notification.payload,
        createdAt: notification.created_at
    };
    if(!webhookUrl){
        console.log(
            `Webhook mock notification for ${notification.recipient_account}: ${notification.notification_type}`,
            notificationPayload
        );

        return true;
    }
    const response = await fetch(webhookUrl,{
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(notificationPayload)
    })
    if(!response.ok){
        const errorBody = await response.text()

        throw new Error(
           `Webhook notification failed with status ${response.status}: ${errorBody}`
        )
    }
    console.log(
        `Webhook notification delivered for ${notification.recipient_account}: ${notification.notification_type}`
    );
    return true;
}
export async function processNotificationEvent(event){
    const targets = buildNotificationTargets(event)
    const processedNotification = [];
    for(const target of targets){
        const notification = await createNotification({
            transactionId: event.transactionId,
            recipientAccount: target.recipientAccount,
            notificationType: target.notificationType,
            payload: target.payload
        })
        try{
            await sendNotification(notification)

            const sentNotification = await markNotificationSent(notification.id)
            await createAuditLog(null, {
                transactionId: notification.transaction_id,
                actor: "notification-worker",
                action: "NOTIFICATION_SENT",
                status: "SENT",
                metadata: {
                    notificationId: notification.id,
                    recipientAccount: notification.recipient_account,
                    notificationType: notification.notification_type
                }
            });
            processedNotification.push(sentNotification)
        } catch(error) {
            const failedNotification = await markNotificationFailed(notification.id,error.message)
            await createAuditLog(null, {
                transactionId: notification.transaction_id,
                actor: "notification-worker",
                action: "NOTIFICATION_FAILED",
                status: "FAILED",
                metadata: {
                    notificationId: notification.id,
                    recipientAccount: notification.recipient_account,
                    notificationType: notification.notification_type,
                    errorMessage: error.message
                }
            });
            processedNotification.push(failedNotification)
        }
    }
    return processedNotification
}