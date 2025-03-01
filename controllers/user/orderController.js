const Order = require("../../Models/orderModel");
const User = require("../../Models/userModel");
const Cart = require("../../Models/cartModel");
const Address = require("../../Models/addressModel");
const Product = require("../../Models/productModel");
const Wallet = require("../../Models/walletModel");

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
    const deliveryCharge = 100;
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

    const finalAmount = Math.max(cartTotal + deliveryCharge - couponReduction, 0);

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
        deliveryCharge,
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
      return res.status(400).send({
        message: "Your cart is empty due to blocked products",
      });
    }
    
    // Calculate total price only for available items
    const totalAmount = availableItems.reduce(
      (total, item) => total + (item.totalPrice || 0), // ✅ Ensure totalPrice is valid
      0
    );
    
    const deliveryCharge = 100;
    const discount = calculateDiscount(availableItems);
    const couponReduction = req.session.couponReduction || 0;
    const finalAmount = totalAmount + deliveryCharge - discount - couponReduction;
    
    const newOrderData = {
      user: userId,
      orderedItems: availableItems.map((item) => ({
        product: item.productId?._id || null,  // ✅ Ensure product exists
        productName: item.productId?.name || "Unknown Product",  // ✅ Prevent undefined values
        quantity: item.quantity || 1, // ✅ Default to 1 if missing
        priceAtPurchase: item.productId?.price ?? 0, // ✅ Ensure price is always a number
      })),
      totalPrice: totalAmount,
      finalAmount,
      discount,
      subTotal: totalAmount,
      deliveryCharge,
      address: selectedAddress,
      paymentMethod,
      couponApplied: !!req.session.coupon,
      couponDiscount: couponReduction,
      couponCode: req.session.coupon || null,
    };
    

    console.log("Generated Order Data:", JSON.stringify(newOrderData, null, 2));

    // Handle different payment methods
    if (paymentMethod === "COD") {
      if (finalAmount > 1000) {
        return res.status(400).json({
          success: false,
          message: "Cash on Delivery is not allowed for orders above ₹1000",
        });
      }
      const newOrder = new Order({
        ...newOrderData,
        paymentStatus: "Pending",
        status: "Processing",
      });
      const savedOrder = await newOrder.save();
      await updateInventoryAndCart(cart, availableItems);
      return res.status(200).json({
        success: true,
        message: "Order placed successfully",
        order: savedOrder,
      });

    } else if (paymentMethod === "Wallet") {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < finalAmount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }

      // Deduct wallet balance
      wallet.balance -= finalAmount;
      wallet.walletHistory.push({
        transactionType: "debit",
        amount: finalAmount,
        description: "Purchase",
      });
      await wallet.save();

      const newOrder = new Order({
        ...newOrderData,
        paymentStatus: "Completed",
        status: "Processing",
      });
      const savedOrder = await newOrder.save();
      await updateInventoryAndCart(cart, availableItems);
      return res.status(200).json({
        success: true,
        message: "Order placed successfully",
        order: savedOrder,
      });

    } else if (paymentMethod === "Razorpay") {
      const options = {
          amount: Math.round(finalAmount * 100),
          currency: "INR",
          receipt: `receipt_${Date.now()}`,
      };
  
      const razorpayOrder = await razorpay.orders.create(options);
  
      // ✅ Ensure `priceAtPurchase` is stored in session
      req.session.pendingOrder = {
          orderData: {
              ...newOrderData,
              orderedItems: availableItems.map((item) => ({
                  product: item.productId._id,
                  productName: item.productId.name || "Unknown Product",
                  quantity: item.quantity,
                  priceAtPurchase: item.productId.price || 0, // ✅ Ensuring price exists
              })),
          },
          razorpayOrderId: razorpayOrder.id,
      };
  
      console.log("Session Pending Order:", JSON.stringify(req.session.pendingOrder, null, 2));
  
      return res.status(200).json({
          success: true,
          razorpayOrderId: razorpayOrder.id,
          finalAmount,
          key_id: process.env.RAZORPAY_ID_KEY,
      });
  }
  

    return res.status(400).json({ message: "Invalid payment method" });

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

    // Handle failed payment first
    if (payment_status === 'Failed') {
      const orderData = {
        ...pendingOrder.orderData,
        razorpayOrderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        status: "Pending",
        paymentStatus: "Failed",
        error: { code: error_code, description: error_description }
      };

      const newOrder = new Order(orderData);
      const savedOrder = await newOrder.save();
      delete req.session.pendingOrder;

      return res.json({ status: "failed", message: "Payment Failed", order: savedOrder });
    }

    // Only verify signature for successful payments
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET_KEY);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.error("Signature verification failed");
      return res.status(400).json({ status: "failed", message: "Payment verification failed" });
    }

    // ✅ Re-fetch product prices before saving order
    for (let item of pendingOrder.orderData.orderedItems) {
      if (!item.priceAtPurchase || item.priceAtPurchase === 0) {
        const product = await Product.findById(item.product);
        item.priceAtPurchase = product ? product.price : 0; // Ensure price is set
      }
    }

    // Create new order
    const newOrder = new Order({
      ...pendingOrder.orderData,
      razorpayOrderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      status: "Processing",
      paymentStatus: "Paid",
    });

    const savedOrder = await newOrder.save();

    // Update inventory and clear cart
    const cart = await Cart.findOne({ userId: newOrder.user });
    if (cart) {
      for (let item of cart.items) {
        if (item.productId) {
          await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: -item.quantity } });
        }
      }
      await Cart.findByIdAndDelete(cart._id);
    }

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
    const { orderId } = req.body;

    // Fetch the order details
    const order = await Order.findOne({ orderId }).populate("orderedItems.product");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Prevent cancelling an already cancelled order
    if (order.status === "Cancelled") {
      return res.status(400).json({ message: "Order is already cancelled" });
    }

    // Restrict cancellation for shipped, delivered, or return requests
    if (["Delivered", "Shipped", "Return"].includes(order.status)) {
      return res.status(400).json({ message: "You cannot cancel this order" });
    }

    // **Check if refund should be processed**  
    const shouldRefund = order.status !== "Pending";  // Refund only if status is NOT "Pending"

    if (shouldRefund) {
      try {
        const updatedWallet = await Wallet.findOneAndUpdate(
          { userId: order.user }, // Find wallet
          {
            $inc: { balance: order.finalAmount }, // Add refund amount
            $push: {
              walletHistory: {
                transactionType: "credit",
                amount: order.finalAmount,
                description: "Refund",
              },
            },
          },
          { new: true, upsert: true } // Create if not exists
        );

        if (!updatedWallet) {
          return res.status(500).json({ message: "Error updating wallet" });
        }
      } catch (error) {
        console.error("Refund error:", error);
        return res.status(500).json({ message: "Error processing wallet refund" });
      }
    }

    // Update the order status
    order.status = "Cancelled";
    order.paymentStatus = shouldRefund ? "Refunded" : "Failed";  // ✅ Fixed Enum Error
    await order.save();

    // Restore product quantities
    for (let item of order.orderedItems) {
      await Product.findByIdAndUpdate(item.product._id, {
        $inc: { quantity: item.quantity },
      });
    }

    return res.status(200).json({
      message: shouldRefund
        ? "Order cancelled successfully. Refund credited to wallet."
        : "Order cancelled successfully. No refund required.",
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
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
      doc.text(`₹${(item.price / item.quantity).toFixed(2)}`, 400, yPosition);

      doc.text(`₹${item.price}`, 500, yPosition);
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
    doc.text(`₹${order.finalAmount}`, 500, yPosition);

    doc.fontSize(10);
    const bottomPosition = doc.page.height - 50;
    doc.text('Thank you for shopping with CyberCrate!', 50, bottomPosition, { align: 'center' });

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
      if (order.paymentStatus === "Completed") {
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
      order.paymentStatus = "Completed";
      order.status = "Processing";
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
    const { orderId } = req.params;
    const userId = req.session.user;

    console.log("Order ID:", orderId);

    // Find order by UUID
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }

    // ✅ Ensure walletHistory exists before pushing
    if (!Array.isArray(wallet.walletHistory)) {
      wallet.walletHistory = [];
    }

    if (!order.deliveredDate) {
      return res.status(400).json({ success: false, message: "Delivered date not found for this order" });
    }

    const currentDate = new Date();
    const expectedDate = new Date(order.deliveredDate);
    expectedDate.setDate(expectedDate.getDate() + 10);

    if (currentDate <= expectedDate) {
      order.status = "Returned"; // ✅ Corrected order status update
      await order.save();

      if (["Wallet", "Online", "COD"].includes(order.paymentMethod)) {
        wallet.balance += order.totalPrice; // ✅ Used totalPrice
        wallet.walletHistory.push({
          transactionId: uuidv4(),
          transactionType: "credit",
          amount: order.totalPrice,
          date: new Date(),
          description: "Refund",
        });

        await wallet.save();
      }

      console.log("✅ Return Order Request Success.");
      console.log("✅ Wallet updated successfully");

      res.status(200).json({ success: true, message: "Return Order Request Confirmed..!" });
    } else {
      res.status(400).json({ success: false, message: "Unfortunately, the return period has expired..!" });
    }
  } catch (error) {
    console.error("❌ Error in Return Order Request:", error);
    res.status(500).json({ message: "Server Error..!" });
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