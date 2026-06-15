

/**
 * Wrapp async express function to forward all catch error to the global error handler 
 * its replace all repeate try catch in req,res function to then function 
 * @param {Function} fn 
 * @returns {Function} express midlleware Function 
 */
export const catchAsync= (fn) =>{
    return (req,res,next)=> {
        fn(req,res,next).catch(next)
    };
};