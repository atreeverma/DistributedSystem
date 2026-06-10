import {
    createNotification,
    markNotificationFailed,
    markNotificationSent
} from "../repositories/notificationRepository.js"

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
    console.log(
        `Notification sent to ${notification.recipient_account}: ${notification.notification_type}`
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
            processedNotification.push(sentNotification)
        } catch(error) {
            const failedNotification = await markNotificationFailed(notification.id,error.message)
            processedNotification.push(failedNotification)
        }
    }
    return processedNotification
}