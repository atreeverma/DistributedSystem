import { initiateTransaction } from "../services/transactionService.services.js";
import { ApiResponse } from "../utils/ApiResponse.js"
export async function transferMoney(req, res) {
    const { fromAccount, toAccount, amount } = req.body;
    if(!fromAccount || !toAccount || !amount) {
        return res.status(400).json(
            new ApiResponse(400, "Missing required fields", null)
        );
    }
    if(amount <= 0) {
        return res.status(400).json(
            new ApiResponse(400, "Amount must be greater than zero", null)
        );
    }
    const idempotencyKey = req.headers["idempotency-key"];

    if (!idempotencyKey) {
        return res.status(400).json( new ApiResponse(400, "Idempotency key required", null));
    }

    const transaction = await initiateTransaction({
        fromAccount,
        toAccount,
        amount,
        idempotencyKey
    });

    return res.status(200).json(
        new ApiResponse(200, "Transaction initiated", transaction)
    );
}