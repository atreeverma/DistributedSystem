import { publishTransaction } from "./producer.js";
import {
    fetchPendingOutboxEvents,
    markOutboxEventFailed,
    markOutboxEventSent
} from "../repositories/outboxRepository.js";

let dispatcherTimer;
let isDispatching = false;

async function dispatchPendingOutboxEvents() {
    if (isDispatching) return;
    isDispatching = true;

    try {
        const events = await fetchPendingOutboxEvents(20);
        for (const event of events) {
            try {
                await publishTransaction(event.payload);
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
    if (dispatcherTimer) return dispatcherTimer;
    dispatcherTimer = setInterval(() => {
        dispatchPendingOutboxEvents().catch((error) => {
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

