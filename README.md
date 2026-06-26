
# Distributed Banking Transaction System

A backend-focused distributed banking system that demonstrates reliable money movement under common failure scenarios: worker crashes, duplicate requests, concurrent transfers, temporary failures, permanent failures, and partial updates.

The project is intentionally built as a backend/system-design implementation rather than a UI project. The important part is not a dashboard; it is whether the system can keep transaction state, wallet balances, messages, notifications, and audit records consistent when different pieces fail.

## What This Project Shows

- Asynchronous transaction processing with RabbitMQ
- PostgreSQL transactions for all-or-nothing wallet updates
- Row-level locking to prevent double spending
- Idempotency keys to avoid duplicate transfers
- Retry handling for temporary worker failures
- Dead letter queue records for permanently failed messages
- Outbox pattern for reliable event publishing
- Notification worker for transfer success/failure events
- Audit logs for tracing transaction lifecycle events
- Docker Compose setup for API, worker, notification worker, PostgreSQL, and RabbitMQ

## Architecture

```text
Client / Postman / curl
        |
        v
Express API
        |
        | 1. Validate request
        | 2. Check idempotency
        | 3. Store transaction as PENDING
        | 4. Store outbox event
        v
PostgreSQL
        |
        v
Outbox Dispatcher
        |
        v
RabbitMQ
   |                |
   v                v
Transaction       Notification
Worker            Worker
   |                |
   v                v
Wallet updates    Notification rows
Audit logs        Audit logs
DLQ on failure
```

## Services

| Service | Responsibility |
| API server | Accepts wallet and transfer requests, exposes monitoring endpoints |
| Transaction worker | Processes transfer messages, updates balances, handles retry/DLQ |
| Notification worker | Consumes notification events and records delivery status |
| PostgreSQL | Stores accounts, transactions, outbox events, DLQ, notifications, audit logs |
| RabbitMQ | Durable queues for transaction and notification processing |

## Reliability Patterns

### Idempotency

Transfers require an `idempotency-key` header. If the same request is retried with the same key, the API returns the existing transaction instead of creating a new one.

### Row-Level Locking

The worker locks both account rows using `FOR UPDATE` before moving money. This prevents two concurrent transfers from spending the same balance.

### ACID Transaction

Debit, credit, transaction status update, audit log, and success outbox event are committed together. If any part fails, the database rolls back.

### Retry and DLQ

Temporary worker failures are retried. Permanent failures such as missing accounts, insufficient balance, or already failed transactions are moved toward failure handling and DLQ visibility.

### Outbox Pattern

The API and worker write outbox events inside the same database transaction as the state change. A dispatcher later publishes those events to RabbitMQ. This avoids losing events if the process crashes between a database write and a queue publish.

### Notification Service

Successful transfers create two notifications:

- `TRANSFER_DEBITED` for the sender
- `TRANSFER_CREDITED` for the receiver

Failed transfers create:

- `TRANSFER_FAILED` for the sender

Notification delivery currently supports mock/webhook-style delivery. With no `NOTIFICATION_WEBHOOK_URL`, notifications are logged and marked as sent. With a URL, the worker can POST the notification payload to an external receiver.

### Audit Service

Audit logs provide a timeline of important actions, such as transfer requested, transfer succeeded, retries, DLQ movement, notification sent, and notification failed.

## Project Structure

```text
banking-system/
  src/
    app.js
    config/
      db.js
      ensureSchema.js
    controllers/
      auditController.controller.js
      notificationController.controller.js
      transactionController.controller.js
      walletController.controller.js
    middleware/
      transfervalidate.middleware.js
    queue/
      notificationWorker.js
      outboxDispatcher.js
      producer.js
      worker.js
    repositories/
      accountRepository.js
      auditRepository.js
      dlqRepository.js
      notificationRepository.js
      outboxRepository.js
      transactionRepository.js
    routes/
      transactionRoutes.routes.js
      walletRoutes.routes.js
    services/
      notificationService.services.js
      transactionService.services.js
      walletService.services.js
    utils/
      ApiError.js
      ApiResponse.js
      asyncHandler.js
  schema.sql
  docker-compose.yml
  Dockerfile
  package.json
  test/
```

## Running Locally With Docker

From the project directory:

```bash
cd banking-system
docker compose up --build
```

RabbitMQ Management UI:

```text
http://localhost:15672
username: guest
password: guest
```

API health check:

```bash
curl http://localhost:3000/health
```

## Running Without Docker

Start PostgreSQL and RabbitMQ yourself, then set:

```env
PORT=3000
DATABASE_URL=postgresql://admin:admin@localhost:5432/banking_db
RABBITMQ_URL=amqp://guest:guest@localhost:5672
MAX_RETRIES=3
RETRY_DELAY_MS=5000
WORKER_RECONNECT_MS=5000
NOTIFICATION_MAX_RETRIES=3
NOTIFICATION_RETRY_DELAY_MS=5000
NOTIFICATION_WEBHOOK_URL=
```

Run each process in a separate terminal:

```bash
npm.cmd start
npm.cmd run worker
npm.cmd run notification-worker
```

## API Reference

### Health

```http
GET /health
```

### Create Wallet

```http
POST /api/wallets
Content-Type: application/json
```

```json
{
  "userId": "scaler",
  "initialBalance": 5000
}
```

### Get Wallet

```http
GET /api/wallets/scaler
```

### Create Transfer

```http
POST /api/transfers
Content-Type: application/json
idempotency-key: transfer-demo-1
```

```json
{
  "fromAccount": "scaler",
  "toAccount": "bhm",
  "amount": 500
}
```

The API returns quickly with a `PENDING` transaction. The transaction worker completes it asynchronously.

### Get Transfer Status

```http
GET /api/transfers/{transactionId}
```

### Recent Transactions

```http
GET /api/debug/transactions?limit=20
```

### Dead Letter Queue

```http
GET /api/monitoring/dlq
```

### Notifications

```http
GET /api/monitoring/notifications
GET /api/monitoring/notifications?transactionId={transactionId}
GET /api/monitoring/notifications/dlq
```

### Audit Logs

```http
GET /api/monitoring/audit
GET /api/monitoring/audit?transactionId={transactionId}
GET /api/monitoring/audit?action=TRANSFER_SUCCEEDED
```

## Demo Flow

Create two wallets:

```bash
curl -X POST http://localhost:3000/api/wallets ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"scaler\",\"initialBalance\":5000}"

curl -X POST http://localhost:3000/api/wallets ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"bhm\",\"initialBalance\":1000}"
```

Create a transfer:

```bash
curl -X POST http://localhost:3000/api/transfers ^
  -H "Content-Type: application/json" ^
  -H "idempotency-key: demo-transfer-1" ^
  -d "{\"fromAccount\":\"scaler\",\"toAccount\":\"bhm\",\"amount\":500}"
```

Check system state:

```bash
curl http://localhost:3000/api/debug/transactions
curl http://localhost:3000/api/monitoring/notifications
curl http://localhost:3000/api/monitoring/audit
curl http://localhost:3000/api/wallets/scaler
curl http://localhost:3000/api/wallets/bhm
```

Test idempotency by sending the same transfer again with the same `idempotency-key`. It should not create a second money movement.

## Failure Scenarios To Discuss

### Worker Crash

RabbitMQ messages are acknowledged only after processing succeeds. If a worker dies before ACK, RabbitMQ can redeliver the message.

### Duplicate Request

The unique idempotency key prevents the same transfer request from creating multiple transactions.

### Concurrent Transfers

The worker locks account rows before checking balances and updating wallets, so concurrent debits are serialized safely.

### Permanent Failure

Failures such as insufficient balance or invalid account move the transaction to failed handling and DLQ visibility.

### Notification Failure

Notification processing is isolated from money movement. A notification failure does not roll back a successful transfer.

## Testing

```bash
npm.cmd test
```

Current tests cover repository-level behavior, API response shape, schema execution, and outbox locking. End-to-end validation should be done through Docker because the full system depends on PostgreSQL and RabbitMQ.

## Design Tradeoffs

- The system is backend-only by design. A frontend is not required to demonstrate the distributed systems behavior.
- Authentication and authorization are intentionally out of scope for this version. In production, they would be added at the API gateway or middleware layer using JWT/OAuth, RBAC, rate limiting, and request signing.
- Outbox delivery is at-least-once, not exactly-once. Consumers must be idempotent.
- Notification delivery is provider-agnostic. The current implementation can run in mock/webhook mode and can later be extended to SMS, email, or push providers.

## Interview Talking Points

- Why asynchronous processing improves reliability and user experience
- Why RabbitMQ ACK/NACK is useful for worker crash recovery
- Why row-level locking is simple and effective for wallet balances
- Why idempotency is mandatory for payment APIs
- Why the outbox pattern is safer than writing to DB and queue separately
- Why notification and audit services should be decoupled from transaction processing
- What remains to make this production-grade: auth, rate limiting, metrics, tracing, stronger notification retry/DLQ, and more end-to-end tests

## Current Scope

This project is a practical SDE/backend system design project. It focuses on correctness, failure handling, and operational visibility rather than UI. It is suitable for demonstrating distributed systems fundamentals in an interview or portfolio discussion.


