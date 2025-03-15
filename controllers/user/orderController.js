const Order = require("../../Models/orderModel");
const User = require("../../Models/userModel");
const Cart = require("../../Models/cartModel");
const Address = require("../../Models/addressModel");
const Product = require("../../Models/productModel");
const Wallet = require("../../Models/walletModel");
const mongoose = require("mongoose");

const dotenv = require("dotenv").config({ path: "./.env" });
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { walletPayment, walletRefund } = require("./walletController")
const Razorpay = require("razorpay");
const PDFDocument = require('pdfkit');

//function to get checkout page
const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user._id;
    if (!userId) {
      return res.status(400).send({ message: "User is not logged in" });
    }

    const user = await User.findById(userId).populate("addresses");
    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      select:
        "productName productImage realPrice salePrice quantity discount isBlocked",
    });

    if (!cart || !Array.isArray(cart.items)) {
      return res.render("users/checkout", {
        user,
        addresses: [],
        defaultAddress: null,
        cart: { items: [], totalAmount: 0, discount: 0, finalAmount: 0, cartCount: 0 },
      });
    }

    const addressData = await Address.findOne({ userId });
    const addresses = addressData ? addressData.address : [];
    let defaultAddress = addresses.find((adrs) => adrs._id.toString() === user.defaultAddressId) || addresses[0];

    let cartTotal = 0;
    let totalDiscount = 0;
    
    const couponReduction = req.session.couponReduction || 0;

    const validItems = cart.items.filter((item) => {
      return item.productId && item.productId.quantity > 0 && !item.productId.isBlocked;
    });

    if (validItems.length === 0) {
      return res.render("users/checkout", {
        user,
        addresses,
        defaultAddress,
        cart: {
          items: [],
          totalAmount: 0,
          discount: 0,
          couponReduction: 0,
          finalAmount: 0,
          deliveryCharge: 0,
          cartCount: 0,
        },
        outOfStockMessage: "Some items in your cart are out of stock and have been removed.",
      });
    }

    const items = validItems.map((item) => {
      const regularPrice = item.productId.realPrice || 0;
      const salePrice = item.productId.salePrice || regularPrice;
      const discount = regularPrice - salePrice;
      const totalPrice = salePrice * item.quantity;

      cartTotal += totalPrice;
      totalDiscount += discount * item.quantity;

      return {
        ...item.toObject(),
        totalPrice: totalPrice.toFixed(2),
        discount: discount.toFixed(2),
      };
    });

    const finalAmount = Math.max(cartTotal - couponReduction, 0);

    res.render("users/checkout", {
      user,
      addresses,
      defaultAddress,
      cart: {
        items,
        totalAmount: cartTotal.toFixed(2),
        discount: totalDiscount.toFixed(2),
        couponReduction: parseFloat(couponReduction).toFixed(2),
        finalAmount: finalAmount.toFixed(2),
        
        cartCount: validItems.length,
      },
    });
  } catch (error) {
    console.error("Error loading checkout page:", error);
    res.status(500).send({ message: "Error loading checkout page" });
  }
};

//function to calculate discount
const calculateDiscount = (items) => {
  return items.reduce((discount, item) => {
    const productDiscount = item.productId.discount?.discount || 0;
    return discount + productDiscount * item.quantity;
  }, 0);
};

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_ID_KEY,
  key_secret: process.env.RAZORPAY_SECRET_KEY,
});

const placeOrders = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { paymentMethod, selectedAddressId } = req.body;

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    const addressData = await Address.findOne(
      { userId, "address._id": selectedAddressId },
      { "address.$": 1 }
    );

    if (!addressData || !addressData.address || addressData.address.length === 0) {
      return res.status(400).send({ message: "Selected address not found" });
    }

    const selectedAddress = addressData.address[0];
    const availableItems = cart.items.filter((item) => item.productId && !item.productId.isBlocked);

    if (availableItems.length === 0) {
      return res.status(400).send({ message: "Your cart is empty due to blocked products" });
    }

    let totalAmount = 0;
    let totalDiscount = 0;
    
    const couponReduction = req.session.couponReduction || 0;

    // ✅ Calculate `totalAmount` and `totalDiscount` correctly
    const orderedItems = availableItems.map((item) => {
      const regularPrice = item.productId?.realPrice || 0;
      const salePrice = item.productId?.salePrice || regularPrice;
      const discount = regularPrice - salePrice;
      const totalPrice = salePrice * item.quantity;

      totalAmount += totalPrice;
      totalDiscount += discount * item.quantity;

      const productDetails = item.productId
  ? { 
      name: item.productId.productName || "Unknown Product",
      price: item.productId.salePrice || item.productId.realPrice || 0 ,
      image: item.productId.productImage[0] || null 
    }
  : { name: "Unknown Product", price: 0 };

return {
  product: item.productId?._id || null,
  productName: productDetails.name,
  productImage: productDetails.image, 
  quantity: item.quantity || 1,
  priceAtPurchase: productDetails.price,  // ✅ Store the correct product price
  discountAtPurchase: discount,  
  status: "Processing",
  paymentStatus: "Pending",
};

    });

    const finalAmount = Math.max(totalAmount  - couponReduction, 0);

    const newOrderData = {
      user: userId,
      orderedItems,
      totalPrice: totalAmount.toFixed(2),
      finalAmount: finalAmount.toFixed(2),
      finalAmountog:finalAmount.toFixed(2),
      discount: totalDiscount.toFixed(2),
      couponDiscount: couponReduction.toFixed(2), 
      
      address: selectedAddress,
      paymentMethod,
      overallStatus: "Processing",
      overallPaymentStatus: "Pending",
    };

    console.log("Generated Order Data:", JSON.stringify(newOrderData, null, 2));

    let savedOrder;

    if (paymentMethod === "COD") {
      if (finalAmount > 1000) {
        return res.status(400).json({ success: false, message: "COD is not allowed for orders above ₹1000." });
      }

      savedOrder = await new Order(newOrderData).save();
      await updateInventoryAndCart(cart, availableItems);

    } else if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });

      if (!wallet || wallet.balance < finalAmount) {
        return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
      }

      // ✅ Deduct wallet balance
      wallet.balance -= finalAmount;
      wallet.walletHistory.push({ transactionType: "debit", amount: finalAmount, description: "Purchase" });
      await wallet.save();

      savedOrder = await new Order({
        ...newOrderData,
        overallPaymentStatus: "Completed",
        orderedItems: orderedItems.map(item => ({
          ...item,
          paymentStatus: "Completed"
        })),
      }).save();

      await updateInventoryAndCart(cart, availableItems);

    } else if (paymentMethod === "Razorpay") {
      const options = {
        amount: Math.round(finalAmount * 100),
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
      };

      const razorpayOrder = await razorpay.orders.create(options);

      req.session.pendingOrder = {
        orderData: { ...newOrderData },
        razorpayOrderId: razorpayOrder.id,
      };

      return res.status(200).json({
        success: true,
        razorpayOrderId: razorpayOrder.id,
        finalAmount,
        key_id: process.env.RAZORPAY_ID_KEY,
      });
      
    } else {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    // ✅ Reset the coupon after successful order placement
    req.session.couponReduction = 0;
    delete req.session.appliedCoupon;
    
    return res.status(200).json({ success: true, message: "Order placed successfully", order: savedOrder });
    
  } catch (error) {
    console.error("Error placing order:", error);
    return res.status(500).json({ message: "Error placing order" });
  }
};





const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      payment_status,
      error_code,
      error_description
    } = req.body;

    const pendingOrder = req.session.pendingOrder;
    if (!pendingOrder) {
      return res.status(404).json({ error: "No pending order found" });
    }

    // 🔹 Handle Failed Payment
    if (payment_status === 'Failed') {
      const orderData = {
        ...pendingOrder.orderData,
        razorpayOrderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        overallStatus: "Pending",
        overallPaymentStatus: "Failed",
        orderedItems: pendingOrder.orderData.orderedItems.map(item => ({
          ...item,
          paymentStatus: "Pending"
        })),
        error: { code: error_code, description: error_description }
      };

      const failedOrder = await new Order(orderData).save();
      delete req.session.pendingOrder;
      return res.json({ status: "failed", message: "Payment Failed", order: failedOrder });
    }

    // 🔹 Verify Razorpay Signature for Success
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET_KEY);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.error("Signature verification failed");
      return res.status(400).json({ status: "failed", message: "Payment verification failed" });
    }

    // 🔹 Re-fetch Product Prices Before Saving Order
    for (let item of pendingOrder.orderData.orderedItems) {
      if (!item.priceAtPurchase || item.priceAtPurchase === 0) {
        const product = await Product.findById(item.product);
        item.priceAtPurchase = product ? product.salePrice || product.realPrice : 0; // Ensure correct price
      }
    }

    // 🔹 Save Finalized Order
    const finalizedOrder = new Order({
      ...pendingOrder.orderData,
      razorpayOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      overallStatus: "Processing",
      overallPaymentStatus: "Completed",
      orderedItems: pendingOrder.orderData.orderedItems.map(item => ({
        ...item,
        paymentStatus: "Completed"
      })),
    });

    const savedOrder = await finalizedOrder.save();

    // 🔹 Update Inventory & Clear Cart
    const cart = await Cart.findOne({ userId: savedOrder.user });
    if (cart) {
      await updateInventoryAndCart(cart, pendingOrder.orderData.orderedItems);
    }

    // ✅ Reset Session Variables (Only After Everything Is Successful)
    delete req.session.pendingOrder;

    return res.json({ status: "success", message: "Payment verified successfully", order: savedOrder });

  } catch (error) {
    console.error("Error verifying payment:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};



const updateInventoryAndCart = async (cart, availableItems) => {
  for (let item of availableItems) {
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { quantity: -item.quantity },
    });
  }
  await Cart.findByIdAndDelete(cart._id);
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId, itemId } = req.body;
    console.log("🔍 Cancel Order Request Received:", { orderId, itemId });

    // ✅ Ensure `orderId` is treated as a string
    const order = await Order.findOne({ orderId: orderId.toString() }).populate("orderedItems.product");

    if (!order) {
      console.log("❌ Order not found:", orderId);
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status === "Cancelled") {
      console.log("🚫 Order already cancelled:", orderId);
      return res.status(400).json({ message: "Order is already cancelled" });
    }

    // ✅ Find item index
    const itemIndex = order.orderedItems.findIndex((item) => item._id.toString() === itemId);
    if (itemIndex === -1) {
      console.log("❌ Item not found in order:", itemId);
      return res.status(404).json({ message: "Item not found in order" });
    }

    const item = order.orderedItems[itemIndex];

    // 🚫 Prevent cancellation for certain statuses
    if (["Delivered", "Shipped", "Return"].includes(item.status)) {
      console.log("🚫 Cannot cancel this item (status restriction)");
      return res.status(400).json({ message: "You cannot cancel this item" });
    }

    // ✅ Refund Handling
    const shouldRefund = item.status !== "Pending";
    let refundAmount = 0;

    if (shouldRefund) {
      try {
        const productSubtotal = item.priceAtPurchase * item.quantity;
        const proportionateCouponDiscount = (productSubtotal / order.totalPrice) * (order.couponDiscount || 0);
        refundAmount = productSubtotal - proportionateCouponDiscount;

        console.log("💰 Refund Amount Calculated:", refundAmount);

        let wallet = await Wallet.findOne({ userId: order.user });

        if (!wallet) {
          console.log("🆕 Creating a new wallet for user:", order.user);
          wallet = new Wallet({
            userId: order.user,
            balance: 0,
            walletHistory: [],
          });
        }

        if (typeof wallet.balance !== "number") {
          console.log("⚠️ Wallet balance was undefined. Initializing to 0.");
          wallet.balance = 0;
        }

        wallet.balance += refundAmount;
        wallet.walletHistory.push({
          transactionType: "credit",
          amount: refundAmount,
          description: "Refund",
        });

        await wallet.save();
        console.log("✅ Wallet refunded successfully!");
      } catch (error) {
        console.error("❌ Refund error:", error);
        return res.status(500).json({ message: "Error processing wallet refund" });
      }
    }

    // ✅ Update item status
    order.orderedItems[itemIndex].status = "Cancelled";

    // Check if all items are cancelled
    const allItemsCancelled = order.orderedItems.every((item) => item.status === "Cancelled");
    if (allItemsCancelled) {
      order.status = "Cancelled";
    }

    // Update final order amount (prevent negative values)
    order.finalAmount = Math.max(order.finalAmount - refundAmount, 0);

    // Update payment status
    order.paymentStatus = shouldRefund ? "Refunded" : "Failed";

    await order.save();

    // ✅ Restore product stock
    await Product.findByIdAndUpdate(item.product._id, {
      $inc: { quantity: item.quantity },
    });

    return res.status(200).json({
      message: shouldRefund
        ? "Item cancelled successfully. Refund credited to wallet."
        : "Item cancelled successfully. No refund required.",
    });
  } catch (error) {
    console.error("❌ Error cancelling order:", error);
    return res.status(500).json({ message: "Error cancelling order" });
  }
};






//function to get user orders
const getUserOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    const orders = await Order.find({ user: userId })
      .populate("orderedItems.product")
      .sort({ createdAt: -1 });

    res.render("users/orders", { orders, user: user });
  } catch (error) {
    console.error("Error getting user orders:", error);
    res.status(500).send({ message: "Error getting user orders" });
  }
};

//function to select address
const selectAddress = async (req, res) => {
  const userId = req.session.user;
  try {
    const { selectedAddressId } = req.body;
    if (!userId || !selectedAddressId) {
      return res.status(400).send({
        message: "UserId or addressId is not specified",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({
        message: "User not found",
      });
    }

    user.defaultAddressId = selectedAddressId;
    await user.save();
    res.redirect("/checkout");
  } catch (error) {
    console.error("Error selecting address:", error);
    res.status(500).send({ message: "Error selecting address" });
  }
};

//function to get order details
const orderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.id;

    // const order=await Order.findById(orderId).populate("orderedItems.product");
    const order = await Order.findOne({ orderId }).populate({
      path: "orderedItems.product",
      populate: {
        path: "category brand",
        select: "categoryName brandName"
      },
      select: "productName productImage description ",
    });

    console.log('order', order.deliveryCharge);

    if (!order) {
      return res.status(404).send({ message: "Order not found" });
    }

    res.render("users/orderDetails", { order, userId });
  } catch (error) {
    console.error("Error fetching order details:", error.message);
    res.status(500).send({ message: "Internal Server Error" });
  }
}

// Controller function to generate and download invoice
const generateInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findOne({ orderId }).populate({
      path: "orderedItems.product",
      populate: {
        path: "category brand",
        select: "categoryName brandName"
      },
      select: "productName productImage description realPrice salePrice"
    });

    if (!order) {
      return res.status(404).send("Order not found");
    }

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
    doc.pipe(res);

    // Add company logo/header
    doc.fontSize(20).text('CyberCrate', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text('Tax Invoice/Bill of Supply', { align: 'center' });
    doc.moveDown();

    // Add a line separator
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // Order and Customer Details section
    doc.fontSize(12);
    doc.text(`Invoice Date: ${new Date(order.createdAt).toLocaleDateString()}`);
    doc.text(`Order ID: ${order.orderId}`);
    doc.moveDown();

    // Billing Address
    doc.fontSize(14).text('Billing Address:', { underline: true });
    doc.fontSize(12);
    doc.text(order.address.name);
    doc.text(`${order.address.addressType}`);
    doc.text(`${order.address.landMark}, ${order.address.city}`);
    doc.text(`${order.address.state} - ${order.address.pincode}`);
    doc.text(`Phone: ${order.address.phone}`);
    doc.moveDown();

    // Order Items Table
    doc.fontSize(14).text('Order Items:', { underline: true });
    doc.moveDown();

    // Table headers
    const tableTop = doc.y;
    doc.fontSize(12);
    doc.text('Item', 50, tableTop);
    doc.text('Qty', 300, tableTop);
    doc.text('Price', 400, tableTop);
    doc.text('Total', 500, tableTop);

    // Add a line below headers
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();

    // Table contents
    let yPosition = doc.y + 15;
    order.orderedItems.forEach(item => {
      doc.text(item.product.productName, 50, yPosition);
      doc.text(item.quantity.toString(), 300, yPosition);
      // doc.text(`₹${item.price / item.quantity}`, 400, yPosition);
      doc.text(`₹${(item.priceAtPurchase / item.quantity).toFixed(2)}`, 400, yPosition);

      doc.text(`₹${item.priceAtPurchase}`, 500, yPosition);
      yPosition += 20;
    });

    // Add a line above summary
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 20;

    // Order Summary
    doc.fontSize(12);
    doc.text('Subtotal:', 400, yPosition);
    doc.text(`₹${order.totalPrice}`, 500, yPosition);
    yPosition += 20;

    if (order.deliveryCharge) {
      doc.text('Shipping:', 400, yPosition);
      doc.text(`₹${order.deliveryCharge}`, 500, yPosition);
      yPosition += 20;
    }

    if (order.discount) {
      doc.text('Discount:', 400, yPosition);
      doc.text(`-₹${order.discount}`, 500, yPosition);
      yPosition += 20;
    }

    if (order.couponDiscount) {
      doc.text('Coupon Discount:', 400, yPosition);
      doc.text(`-₹${order.couponDiscount}`, 500, yPosition);
      yPosition += 20;
    }

    doc.fontSize(14);
    doc.text('Total Amount:', 400, yPosition);
    doc.text(`₹${order.finalAmountog.toFixed(2)}`, 500, yPosition);

    doc.fontSize(10);
    const bottomPosition = doc.page.height - 50;
    doc.text('Thank you for shopping with CyberStore!', 50, bottomPosition, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).send("Error generating invoice");
  }
};


const createRetryPaymentOrder = async (req, res) => {
  try {
      const { orderId, finalAmount } = req.body;

      const order = await Order.findOne({ orderId });
      if (!order) {
          return res.status(404).json({ 
              success: false, 
              message: "Order not found" 
          });
      }

      // Create new Razorpay order
      const options = {
          amount: Math.round(finalAmount * 100),
          currency: "INR",
          receipt: orderId,
          payment_capture: 1,
      };

      const razorpayOrder = await razorpay.orders.create(options);

      // Save the new Razorpay order ID to the order
      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      return res.status(200).json({
          success: true,
          razorpayOrderId: razorpayOrder.id
      });

  } catch (error) {
      console.error("Error creating retry payment order:", error);
      return res.status(500).json({ 
          success: false, 
          message: "Error creating payment order" 
      });
  }
};






const retryPayment = async (req, res) => {
  try {
      console.log("🛠️ Retry Payment API called with data:", req.body);

      const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      // Validate request parameters
      if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
          console.error("❌ Missing parameters:", req.body);
          return res.status(400).json({ status: "error", message: "Invalid payment details. Order ID is required." });
      }

      // Fetch the order from database
      const order = await Order.findOne({ orderId: orderId });

      if (!order) {
          console.error("❌ Order not found for ID:", orderId);
          return res.status(404).json({ status: "error", message: "Order not found" });
      }

      console.log("✅ Order Found:", order);

      // Check if order is already paid
      if (order.overallPaymentStatuspaymentStatus === "Completed") {
          return res.status(400).json({ status: "error", message: "Payment has already been completed" });
      }

      // Verify Razorpay signature
      const crypto = require("crypto");
      const secretKey = process.env.RAZORPAY_SECRET_KEY;

      if (!secretKey) {
          return res.status(500).json({ status: "error", message: "Server configuration error: Secret key missing" });
      }

      const generated_signature = crypto.createHmac("sha256", secretKey)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest("hex");

      if (generated_signature !== razorpay_signature) {
          return res.status(400).json({ status: "error", message: "Payment verification failed" });
      }

      // ✅ Update order status
      order.overallPaymentStatus = "Completed";
      order.overallStatus = "Processing";
      await order.save();

      console.log("✅ Order Updated Successfully:", order);

      return res.status(200).json({ status: "success", message: "Payment successful!", order });

  } catch (error) {
      console.error("❌ Retry Payment Error:", error);
      return res.status(500).json({ status: "error", message: "Server error occurred during retry payment" });
  }
};








const ReturnOrder = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.user;

    console.log("🔍 Searching for Order with ID:", orderId);
    const order = await Order.findOne({ orderId });
    if (!order) {
      console.log("❌ Order not found:", orderId);
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    console.log("📝 Order found:", order);

    console.log("🔍 Searching for Item with ID:", itemId);
    const itemObjectId = new mongoose.Types.ObjectId(itemId);
    const itemIndex = order.orderedItems.findIndex(i => i._id.equals(itemObjectId));

    if (itemIndex === -1) {
      console.log("❌ Item not found in order:", itemId);
      return res.status(404).json({ success: false, message: "Item not found in this order" });
    }

    const item = order.orderedItems[itemIndex];

    if (item.status === "Returned") {
      return res.status(400).json({ success: false, message: "Item already returned" });
    }

    if (item.status !== "Delivered") {
      return res.status(400).json({ success: false, message: "Item must be delivered before returning" });
    }

    if (!item.deliveredDate) {
      console.log("❌ Item does not have a deliveredDate. Cannot process return.");
      return res.status(400).json({ success: false, message: "Delivered date not found for this item" });
    }

    const currentDate = new Date();
    const expectedDate = new Date(item.deliveredDate);
    expectedDate.setDate(expectedDate.getDate() + 10); // 10-day return policy

    if (currentDate <= expectedDate) {
      // ✅ Update item status
      order.orderedItems[itemIndex].status = "Returned";

      // ✅ Check if all items are returned
      const allItemsReturned = order.orderedItems.every(i => i.status === "Returned");

      // ✅ Calculate refund amount (Proportional to coupon discount)
      let refundAmount;
      if (allItemsReturned) {
        refundAmount = order.finalAmount; // Full refund for the entire order
      } else {
        const productSubtotal = item.priceAtPurchase * item.quantity;
        const proportionateCouponDiscount = (productSubtotal / order.totalPrice) * order.couponDiscount; 
        refundAmount = productSubtotal - proportionateCouponDiscount;
      }
      let changetotal = Math.max(order.finalAmount - refundAmount, 0); 
      order.finalAmount=changetotal;

      await order.save();
      console.log("✅ Item status updated successfully!");

      // ✅ Process Wallet Refund
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        console.log("❌ Wallet not found for user. Creating a new wallet...");
        wallet = new Wallet({
          userId,
          balance: 0,
          walletHistory: [],
        });
      }

      console.log("🛠️ Wallet Balance BEFORE:", wallet.balance);
      wallet.balance += refundAmount;
      console.log("💰 Wallet Balance AFTER:", wallet.balance);

      wallet.walletHistory.push({
        transactionId: uuidv4(),
        transactionType: "credit",
        amount: refundAmount,
        date: new Date(),
        description: 'Refund',
      });

      await wallet.save();
      console.log("✅ Wallet updated successfully!");

      return res.status(200).json({ 
        success: true, 
        message: "Return request confirmed for item..!", 
        refundAmount
      });
    } else {
      console.log("❌ Return period expired!");
      return res.status(400).json({ success: false, message: "Return period expired..!" });
    }
  } catch (error) {
    console.error("❌ Error in Return Order Request:", error);
    return res.status(500).json({ message: "Server Error..!" });
  }
};










module.exports = {
  getUserOrders,
  placeOrders,
  verifyPayment,
  getCheckoutPage,
  cancelOrder,
  selectAddress,
  orderDetails,
  generateInvoice,
  retryPayment,
  createRetryPaymentOrder,
  ReturnOrder
};