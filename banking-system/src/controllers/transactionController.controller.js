import { initiateTransaction } from "../services/transactionService.services.js";
import { ApiResponse } from "../utils/ApiResponse.js"
import { getTransactionStatus } from "../services/transactionService.services.js";
import { getRecentTransactions} from "../services/transactionService.services"
import { listDlqEntries } from "../repositories/dlqRepository.js"
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

    return res.status(202).json(
        new ApiResponse(202, "Transaction initiated", transaction)
    );
}

export async function getTransactionController(req,res){
    const {transactionId} = req.params
    const transaction = await getTransactionStatus(transactionId)
    return res.status(200).json(new ApiResponse(200,"Transaction fetched",transaction))
}
export async function listRecentTransactionsController(req,res){
    const transactions = await getRecentTransactions(req.query.limit)

    return res.status(200).json(
        new ApiResponse(200,"Transaction fetched",transactions)
    )
}
export async function listDlqController(req,res){
    const messages = await listDlqEntries(req.query.limit)

    return res.status(200).json(
        new ApiResponse(200,"Dead letter queue fetched",{
            count: messages.length,
            messages
        })
    )
}