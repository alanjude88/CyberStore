const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => uuidv4(),
        unique: true,
    },
    orderedItems: [{  // ✅ Kept only one orderedItems field
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        productName: { type: String, required:true },  // ✅ Stores the product name at the time of order
        quantity: { type: Number, required: true },
        priceAtPurchase: { type: Number, required: true }
    }],
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',  
        required: true
    },
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
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    paymentMethod: { type: String, enum: ['COD', 'Bank', 'Wallet', 'Razorpay'] },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Completed', 'Failed', 'Refunded', 'Paid'], // ✅ Added 'Paid'
        default: 'Pending'
    },
    subTotal: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },
    deliveryCharge: { type: Number },
    deliveryMethod: { type: String },
    invoiceDate: { type: Date },
    deliveredDate: { type: Date, default: null },  // ✅ Keeps track of delivery date
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned', 'Refund Completed']
    },
    couponApplied: { type: Boolean, default: false },
    couponDiscount: { type: Number, default: null },
    couponCode: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
