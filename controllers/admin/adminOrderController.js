const Order = require("../../Models/orderModel");
const User = require("../../Models/userModel");
const Product = require('../../Models/productModel');
const Category = require('../../Models/categoryModel');
const Brand = require('../../Models/brandModel');
const StatusCodes = require('../../util/statusCodes');

const getAllOrders = async (req, res) => {
    try {
        const filterStatus = req.query.status || "";

        
        let filter = {};
        if (filterStatus) {
            filter = { "orderedItems.status": filterStatus };
        }

        let orders = await Order.find(filter)
            .populate("orderedItems.product")
            .populate("user", "name email")
            .sort({ createdAt: -1 });

        
        orders = orders.filter(order => order.user);

        // Pagination logic
        const itemsPerPage = 10;
        const page = parseInt(req.query.page) || 1;
        const totalPages = Math.ceil(orders.length / itemsPerPage);
        const pageOrders = orders.slice((page - 1) * itemsPerPage, page * itemsPerPage);

        res.render("admin/orderList", { 
            orders: pageOrders, 
            totalPages: totalPages, 
            currentPage: page,
            filterStatus: filterStatus,
            itemsPerPage: itemsPerPage
        });

    } catch (error) {
        console.error("Error getting all orders:", error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ message: "Error getting all orders" });
    }
};




const updateStatus = async (req, res) => {
    try {
        console.log("Received request body:", req.body);
        const { orderId, productId, updatedStatus } = req.body;

        if (!orderId || !productId || !updatedStatus) {
            return res.status(StatusCodes.BAD_REQUEST).json({ message: "Missing required fields" });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: "Order not found" });
        }

        const item = order.orderedItems.find(item => item._id.toString() === productId);
        if (!item) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: "Product not found in this order" });
        }

        console.log(`Updating item ${productId} status from ${item.status} to ${updatedStatus}`);

        
        if (item.status === 'Cancelled' && updatedStatus !== 'Refund Completed') {
            return res.status(StatusCodes.BAD_REQUEST).json({ message: "You cannot update the status of a cancelled product." });
        }

        
        if (updatedStatus === 'Cancelled' && item.status !== 'Pending') {
            return res.status(StatusCodes.BAD_REQUEST).json({ message: "You cannot cancel a product that has already been processed." });
        }
        if (item.status === "Delivered" && updatedStatus !== "Returned") {
            return res.status(StatusCodes.BAD_REQUEST).json({ message: "Delivered products can only be updated to Returned." });
        }

        
        if (updatedStatus === "Delivered") {
            if (!item.deliveredDate) {
                item.deliveredDate = new Date();
            }
        }

       
        item.status = updatedStatus;
        await order.save();

        
        const allDelivered = order.orderedItems.every(product => product.status === "Delivered");

        if (allDelivered) {
            order.status = "Delivered";
            if (!order.deliveredDate) {
                order.deliveredDate = new Date();
            }
            await order.save();
        }

        console.log("✅ Status updated successfully:", { item, orderStatus: order.status });

        return res.json({ success: true, message: "Product status updated successfully", item, orderStatus: order.status });

    } catch (error) {
        console.error('❌ Error while updating product status:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: "Error while updating product status" });
    }
};



const viewOrder = async (req, res) => {
    try {
        
        const orderId = req.params.id;
        const order = await Order.findById(orderId).populate("orderedItems.product");
        if (!order) {
            return res.status(StatusCodes.NOT_FOUND).send({ message: "Order not found" });
        }
        res.render("admin/viewOrder", { order });
    } catch (error) {
        console.error("Error fetching order details:", error.message);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ message: "Internal Server Error" });
    }
};

module.exports = {
    getAllOrders,
    updateStatus,
    viewOrder
};
