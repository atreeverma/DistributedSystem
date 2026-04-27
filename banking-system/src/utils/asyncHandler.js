const asyncHandler=(requestHandler)=>{
    return (req,res,next) => {
        Promise.resolve(requestHandler(req,res,next))
        .catch((err)=>next(err));//gives the error to the next middleware
    }
}

export {asyncHandler};