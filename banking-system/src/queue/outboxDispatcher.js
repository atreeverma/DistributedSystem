import { publishTransaction, publishNotification } from "./producer.js";
import {
    fetchPendingOutboxEvents,
    markOutboxEventFailed,
    markOutboxEventSent
} from "../repositories/outboxRepository.js";

let dispatcherTimer;
let isDispatching = false;

async function dispatchPendingOutboxEvents() {
    if (isDispatching) return;//if the events are already being dispatched, return
    isDispatching = true;//set the isDispatching flag to true

    try {
        const events = await fetchPendingOutboxEvents(20);
        for (const event of events) {
            try {
                if (event.event_type === "TRANSACTION_CREATED") {
                    await publishTransaction(event.payload);
                } else if (
                    event.event_type === "TRANSACTION_SUCCEEDED" ||
                    event.event_type === "TRANSACTION_FAILED"
                ) {
                    await publishNotification(event.payload);
                }else {
                    await markOutboxEventFailed(event.id);
                    console.warn(`Unknown outbox event type: ${event.event_type}`);
                    continue;
                }
                await markOutboxEventSent(event.id);
            } catch (error) {
                await markOutboxEventFailed(event.id);
                console.error(`Failed to dispatch outbox event ${event.id}: ${error.message}`);
            }
        }
    } finally {
        isDispatching = false;
    }
}

export function startOutboxDispatcher(intervalMs = 2000) {
    if (dispatcherTimer) return dispatcherTimer;//if the dispatcher timer is already set, return it
    dispatcherTimer = setInterval(() => {
        dispatchPendingOutboxEvents().catch((error) => {//every 2 seconds it will try to dispatch the pending outbox events
            console.error(`Outbox dispatch loop error: ${error.message}`);
        });
    }, intervalMs);
    return dispatcherTimer;
}

export function stopOutboxDispatcher() {
    if (dispatcherTimer) {
        clearInterval(dispatcherTimer);
        dispatcherTimer = null;
    }
}

