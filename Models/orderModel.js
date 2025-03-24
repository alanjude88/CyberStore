const mongoose = require("mongoose");
const { Schema } = mongoose;

const orderSchema = new Schema({
    orderId: { type: String, default: () => require('uuid').v4(), unique: true },
    orderedItems: [{  
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        productName: { type: String, required: true },
        productImage: { type: String, required: true },
        quantity: { type: Number, required: true },
        priceAtPurchase: { type: Number, required: true },
        status: {  
            type: String,
            enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned'],
            default: 'Processing'
        },
        paymentStatus: {  
            type: String,
            enum: ['Pending', 'Completed', 'Refunded'],
            default: 'Pending'
        },
        deliveredDate: { type: Date, default: null } 
    }],
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    address: {
        addressType: { type: String, required: true },
        name: { type: String, required: true },
        city: { type: String, required: true },
        landMark: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: Number, required: true },
        phone: { type: String, required: true },
        alterPhone: { type: String, required: true }
    },
    paymentMethod: { type: String, enum: ['COD', 'Bank', 'Wallet', 'Razorpay'] },
    totalPrice: { type: Number, required: true },
    finalAmount: { type: Number, required: true },
    finalAmountog:{type:Number,default:0},
    discount: { type: Number, default: 0 },
    couponDiscount: { type: Number, default: 0 }, 
    deliveryCharge: { type: Number },
    invoiceDate: { type: Date },
    deliveredDate: { type: Date, default: null }, 
    overallStatus: {  
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Processing'
    },
    overallPaymentStatus: {  
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
        default: 'Pending'
    },
   
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
