# Demo Script

Use this script to demo the distributed banking system end to end. The goal is to show correctness, reliability, and observability rather than UI.

## 1. Start The System

```bash
cd banking-system
docker compose down
docker compose up --build
```

In another terminal, verify the API:

```bash
curl http://localhost:3000/health
```

Expected: `status` should be `healthy`.

## 2. Create Wallets

```bash
curl -X POST http://localhost:3000/api/wallets ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"scaler\",\"initialBalance\":5000}"

curl -X POST http://localhost:3000/api/wallets ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"bhm\",\"initialBalance\":1000}"
```

Check balances:

```bash
curl http://localhost:3000/api/wallets/scaler
curl http://localhost:3000/api/wallets/bhm
```

## 3. Create A Transfer

Use a new idempotency key for each fresh demo run.

```bash
curl -X POST http://localhost:3000/api/transfers ^
  -H "Content-Type: application/json" ^
  -H "idempotency-key: demo-transfer-1" ^
  -d "{\"fromAccount\":\"scaler\",\"toAccount\":\"bhm\",\"amount\":500}"
```

Expected: transaction is created with `PENDING` status.

Copy the returned transaction id.

## 4. Check Transfer Status

```bash
curl http://localhost:3000/api/transfers/PASTE_TRANSACTION_ID_HERE
```

Expected after worker processing: `SUCCESS`.

## 5. Check Final Balances

```bash
curl http://localhost:3000/api/wallets/scaler
curl http://localhost:3000/api/wallets/bhm
```

Expected:

```text
scaler balance decreases by 500
bhm balance increases by 500
```

## 6. Check Notifications

```bash
curl http://localhost:3000/api/monitoring/notifications
```

Expected notification types:

```text
TRANSFER_DEBITED
TRANSFER_CREDITED
```

Also check worker logs:

```bash
docker compose logs -f notification-worker
```

## 7. Check Audit Logs

```bash
curl http://localhost:3000/api/monitoring/audit
```

Useful filters:

```bash
curl "http://localhost:3000/api/monitoring/audit?action=TRANSFER_SUCCEEDED"
curl "http://localhost:3000/api/monitoring/audit?transactionId=PASTE_TRANSACTION_ID_HERE"
```

Expected audit events include transfer requested/succeeded and notification sent.

## 8. Show Idempotency

Send the same transfer again with the same `idempotency-key`:

```bash
curl -X POST http://localhost:3000/api/transfers ^
  -H "Content-Type: application/json" ^
  -H "idempotency-key: demo-transfer-1" ^
  -d "{\"fromAccount\":\"scaler\",\"toAccount\":\"bhm\",\"amount\":500}"
```

Expected: the same transaction is returned or no second money movement happens. Balances should not change a second time.

## 9. Trigger A Failure

Use an amount larger than the sender balance:

```bash
curl -X POST http://localhost:3000/api/transfers ^
  -H "Content-Type: application/json" ^
  -H "idempotency-key: demo-failure-1" ^
  -d "{\"fromAccount\":\"scaler\",\"toAccount\":\"bhm\",\"amount\":999999}"
```

Then check:

```bash
curl http://localhost:3000/api/debug/transactions
curl http://localhost:3000/api/monitoring/dlq
curl http://localhost:3000/api/monitoring/audit
curl http://localhost:3000/api/monitoring/notifications
```

Expected:

```text
transaction eventually fails
DLQ has failure details
audit logs contain failure/DLQ event
notification service records TRANSFER_FAILED
```

## 10. RabbitMQ UI

Open:

```text
http://localhost:15672
```

Credentials:

```text
guest / guest
```

Use this to show queues, message movement, and operational visibility.

## Interview Points To Mention

- API responds quickly with `PENDING`; workers process asynchronously.
- Money movement is protected by database transactions and row locks.
- Duplicate requests are handled by idempotency keys.
- RabbitMQ ACK/NACK handles crash recovery.
- Retry and DLQ provide failure handling and visibility.
- Notifications and audit logs are side effects, decoupled from the core money movement.
