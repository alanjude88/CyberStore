const Coupon=require('../../Models/couponModel');
const Order=require('../../Models/orderModel');
const User=require('../../Models/userModel');
const StatusCodes = require('../../util/statusCodes');

//function to verify coupon
const verifyCoupon = async (req, res) => {
    try {
        const { couponCode, cartTotal } = req.body;

        
        const coupon = await Coupon.findOne({ code: couponCode });
        if (!coupon) {
            return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Coupon not found' });
        }

        
        if (new Date(coupon.expireOn) < new Date()) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Coupon expired.' });
        }

        
        if (cartTotal < coupon.minimumPrice || cartTotal > coupon.maximumPrice) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Coupon not applicable for this order.' });
        }

        
        if (coupon.usedCount >= coupon.usageLimit) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Coupon usage limit reached.' });
        }

        
        if (!coupon.isListed) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Coupon is not valid.' });
        }

        
        const couponReduction = Math.min(coupon.offerPrice, cartTotal);

        
        req.session.coupon = couponCode;
        req.session.couponReduction = couponReduction;

        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Error saving session data.' });
            }

           
            return res.status(StatusCodes.SUCCESS).json({
                success: true,
                message: 'Coupon applied successfully!',
                couponReduction: couponReduction,
            });
        });
        
    } catch (error) {
        console.error('Error while verifying coupon:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error. Please try again later.' });
    }
};


module.exports = {
    verifyCoupon,
};