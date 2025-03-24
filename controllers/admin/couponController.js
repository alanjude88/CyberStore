const Coupon=require('../../Models/couponModel')
const Order=require('../../Models/orderModel');
const StatusCodes = require('../../util/statusCodes');

const loadCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; 
        const limit = 5; 
        const skip = (page - 1) * limit;

        
        const totalCoupons = await Coupon.countDocuments();

       
        const coupons = await Coupon.find()
            .skip(skip)
            .limit(limit);

        const totalPages = Math.ceil(totalCoupons / limit); 

        res.render('admin/coupons', { 
            coupons, 
            currentPage: page, 
            totalPages 
        });
    } catch (error) {
        console.log(error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ message: 'Error loading coupons' });
    }
};


const loadAddCoupon = async (req, res) => {
    try {
        res.render("admin/addCoupon", { coupon: {} }); 
    } catch (error) {
        console.log(error);
    }
};

const createCoupon = async (req,res) => {
    try {
        const {code,offerPrice,minimumPrice,maximumPrice,expireOn,usageLimit,isListed}=req.body;
        const newCoupon=new Coupon({
            code,offerPrice,minimumPrice,maximumPrice,expireOn,usageLimit,isListed
        })

        await newCoupon.save();
        res.redirect('/admin/coupons')
    } catch (error) {
        console.error('Error occured whilr creating the coupon',error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('something went wrong')
    }
}

const loadUpdateCoupon=async(req,res)=>{
    try {
        const {couponID}=req.params;
        const coupon=await Coupon.findById(couponID)

        if(!coupon){
            res.status(StatusCodes.NOT_FOUND).send('Coupon not found')
        }
        res.render('admin/updateCoupon',{coupon})
    } catch (error) {
        console.log('Error loading coupon for update:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Error loading coupon for update');
    }
}

const updateCoupon = async (req,res) => {
    try {
        const {couponID}=req.params;
        const {code,offerPrice,minimumPrice,maximumPrice,expireOn,usageLimit,isListed}=req.body;
        const coupon= await Coupon.findById(couponID);
        if(coupon){
            coupon.code=code;
            coupon.offerPrice=offerPrice;
            coupon.minimumPrice=minimumPrice;
            coupon.maximumPrice=maximumPrice;
            coupon.expireOn=expireOn;
            coupon.usageLimit=usageLimit;
            coupon.isListed=isListed;
            await coupon.save();
        }else{
            res.status(StatusCodes.NOT_FOUND).send('Coupon not found')
        }
        res.redirect('/admin/coupons')
    } catch (error) {
        console.error('Error updating coupon:', error); 
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Server Error');
    }
}

const deleteCoupon = async (req,res) => {
    
    try {
        
        const {couponId}=req.query;
        await Coupon.findByIdAndDelete(couponId);
        res.redirect('/admin/coupons')
    } catch (error) {
        console.error('Error whilee deleting coupon:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Server Error');
    }
}

module.exports={
    loadCoupons,
    loadAddCoupon,
    createCoupon,
    loadUpdateCoupon,
    updateCoupon,
    deleteCoupon
}