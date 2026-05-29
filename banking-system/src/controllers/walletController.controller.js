import { ApiResponse } from "../utils/ApiResponse.js"
import { createWallet } from "../services/walletService.services.js"
import { getWallet } from "../services/walletService.services.js"

export async function createWalletController(req,res) {
    const {userId,initialBalance} = req.body

    const wallet = await createWallet({userId,initialBalance})
    return res.status(201).json(
        new ApiResponse(201,"Wallet Created",wallet)
    )
}

export async function getWalletController(req,res){
    const { userId } = req.params
    const wallet = await getWallet(userId)

    return res.status(200).json(
        new ApiResponse(200,"Wallet fetched",wallet)
    )
}
