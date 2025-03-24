const Order = require("../../Models/orderModel");
const User = require("../../Models/userModel");
const Cart = require("../../Models/cartModel");
const Address = require("../../Models/addressModel");
const Product = require("../../Models/productModel");
const Wallet = require("../../Models/walletModel");
const dotenv = require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const StatusCodes = require('../../util/statusCodes');
// Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_ID_KEY,
    key_secret: process.env.RAZORPAY_SECRET_KEY,
});

// Razorpay order creation
const createRazorpayOrder = async (finalAmount) => {
    const options = {
        amount: Math.round(finalAmount * 100), // Convert to paise
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
    };

    try {
        const razorpayOrder = await razorpay.orders.create(options);
        if (!razorpayOrder) {
            throw new Error("Failed to create Razorpay order");
        }
        return razorpayOrder;
    } catch (error) {
        throw new Error("Error creating Razorpay order: " + error.message);
    }
};

// Verify Razorpay payment
const verifyPayment = async (razorpay_payment_id, razorpay_order_id, razorpay_signature) => {
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET_KEY);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest("hex");

    if (generated_signature === razorpay_signature) {
        const order = await Order.findOneAndUpdate(
            { razorpayOrderId: razorpay_order_id },
            {
                status: "Success",
                paymentId: razorpay_payment_id,
            },
            { new: true }
        );

        if (!order) {
            throw new Error("Order not found");
        }

        return order;
    } else {
        throw new Error("Payment verification failed");
    }
};

// Place order using Wallet Payment
const placeOrderWallet = async (req, res) => {
    try {
        const { selectedAddress, paymentMethod, deliveryMethod, couponCode, totalAmount } = req.body;
        const userId = req.session.user;

        const wallet = await Wallet.findOne({ userId });
        if (!wallet || wallet.balance < totalAmount) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Insufficient Balance in Your Wallet" });
        }

        const userAddress = await Address.findOne({
            userId,
            "address._id": selectedAddress,
        }, { "address.$": 1 });

        if (!userAddress) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Invalid address selected" });
        }

        const addressDetails = userAddress.address[0];
        const cart = await Cart.findOne({ userId }).populate("items.productId");
        if (!cart || cart.items.length === 0) {
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Cart is empty" });
        }

        const orderItems = cart.items.map((item) => ({
            productId: item.productId._id,
            productName: item.productId.productName,
            quantity: item.quantity,
            price: item.price,
        }));

        const order = new Order({
            userId,
            address: addressDetails,
            deliveryCharge: deliveryMethod === "fast" ? 80 : 0,
            total: totalAmount,
            paymentMethod,
            items: orderItems,
            paymentStatus: "Paid",
        });

        await order.save();
        await Cart.findOneAndUpdate({ userId }, { items: [] });

        // Deduct balance from wallet
        wallet.balance -= totalAmount;
        wallet.walletHistory.push({
            transactionId: uuidv4(),
            transactionType: "debit",
            amount: totalAmount,
            date: new Date(),
            description: "Purchase",
        });
        await wallet.save();

        return res.json({ success: true, orderId: order._id });
    } catch (error) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to place the order", error: error.message });
    }
};

module.exports = {
    createRazorpayOrder,
    verifyPayment,
    placeOrderWallet,
};
