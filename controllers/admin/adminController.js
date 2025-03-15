const User = require("../../Models/userModel");
const Product = require("../../Models/productModel");
const Order = require("../../Models/orderModel");
const mongoose = require("mongoose");
const Category = require("../../Models/categoryModel");
const Brand = require("../../Models/brandModel");
const Coupon = require("../../Models/couponModel");
const bcrypt = require("bcrypt");
const { create } = require("connect-mongo");
const exceljs = require("exceljs");
const PDFDocument = require("pdfkit");

const pageError = async (req, res) => {
    console.log("Rendering admin error page");
    res.render("admin/adminError");
  };
 


  
  const securePassword = async (password) => {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      return passwordHash;
    } catch (error) {
      console.log("error while Securing password", error);
    }
  };
  
  const loadAdminLogin = async (req, res) => {
    try {
      if (req.session.admin) {
        res.redirect("/admin/dashboard");
      } else {
        res.render("admin/adminLogin", { error: null });
      }
    } catch (error) {
      console.error("Error loading admin login:", error);
      res
        .status(500)
        .render("admin/adminLogin", { error: "Internal server error" });
    }
  };
  
  const verifyLogin = async (req, res) => {
    try {
      const { email, password } = req.body;
      const admin = await User.findOne({ email: email, isAdmin: true });
  
      if (admin && (await bcrypt.compare(password, admin.password))) {
        req.session.admin = {
          id: admin._id,
          email: admin.email,
        };
        res.redirect("/admin/dashboard");
      } else {
        res.render("admin/adminLogin", { error: "Invalid email or password" });
      }
    } catch (error) {
      console.error("Error in admin login:", error);
      res
        .status(500)
        .render("admin/adminLogin", { error: "Internal server error" });
    }
  };
  
  const logout = async (req, res) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          console.log("Error while destroying session ", err);
          return res.redirect("/pageError");
        } else {
          res.redirect("/admin/login");
        }
      });
    } catch (error) {
      console.log("Error while logging out ", error);
      res.redirect("/pageError");
    }
  };
  // Function to load the admin dashboard
  const loadDashboard = async (req, res) => {
    try {
      const { filterValue, startDate, endDate } = req.query;
      const today = new Date();
      let dayStart, dayEnd;
  
      switch (filterValue) {
        case 'daily':
          dayStart = new Date(today.setHours(0, 0, 0, 0));
          dayEnd = new Date(today.setHours(23, 59, 59, 999));
          break;
        case 'weekly':
          const firstDayOfWeek = today.getDate() - today.getDay();
          dayStart = new Date(today.getFullYear(), today.getMonth(), firstDayOfWeek);
          dayStart.setHours(0, 0, 0, 0);
          dayEnd = new Date(today.getFullYear(), today.getMonth(), firstDayOfWeek + 6);
          dayEnd.setHours(23, 59, 59, 999);
          break;
        case 'monthly':
          dayStart = new Date(today.getFullYear(), today.getMonth(), 1);
          dayEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          dayEnd.setHours(23, 59, 59, 999);
          break;
        case 'yearly':
          dayStart = new Date(today.getFullYear(), 0, 1);
          dayEnd = new Date(today.getFullYear(), 11, 31);
          dayEnd.setHours(23, 59, 59, 999);
          break;
        case 'custom':
          if (startDate && endDate) {
            dayStart = new Date(startDate);
            dayEnd = new Date(endDate);
            dayEnd.setHours(23, 59, 59, 999);
          }
          break;
        default:
          dayStart = new Date(0);
          dayEnd = new Date();
      }
      const deliveredOrdersRevenue = await Order.aggregate([
        {
          $match: {
            "orderedItems.status": "Delivered", // At least one delivered item
            createdAt: { $gte: dayStart, $lte: dayEnd } // Apply the date filter
          }
        },
        {
          $group: {
            _id: "$_id", // Group by order ID
            finalAmount: { $first: "$finalAmount" } // Take the finalAmount for each order
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$finalAmount" } // Sum up the final amounts
          }
        }
      ]);
      
      const totalRevenueForSales = deliveredOrdersRevenue.length > 0 ? deliveredOrdersRevenue[0].totalRevenue : 0;
  
      const topProducts = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
            $match: {
                "orderedItems.status": { $nin: ["Cancelled", "Returned", "Return Requested", "Failed"] },
                createdAt: { $gte: dayStart, $lte: dayEnd },
            },
        },
        {
            $lookup: {
                from: "products",
                localField: "orderedItems.product",
                foreignField: "_id",
                as: "productDetails",
            },
        },
        { $unwind: "$productDetails" },
        {
            $group: {
                _id: "$orderedItems.product",
                productName: { $first: "$productDetails.productName" }, // Fix field name
                productImage: { $first: { $ifNull: ["$productDetails.productImage", ["default.jpg"]] } },
                totalQuantity: { $sum: "$orderedItems.quantity" },
                totalRevenue: {
                    $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.priceAtPurchase"] },
                },
            },
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 },
    ]);
      const topBrands = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
          $match: {
            "orderedItems.status": { $nin: ["Cancelled", "Returned", "Return Request", "Failed"] },
            createdAt: { $gte: dayStart, $lte: dayEnd },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.product",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        { $unwind: "$productDetails" },
        {
          $lookup: {
            from: "brands",
            localField: "productDetails.brand",
            foreignField: "_id",
            as: "brandDetails",
          },
        },
        { $unwind: "$brandDetails" },
        {
          $match: {
            "productDetails.isBlocked": false,
            "brandDetails.isBlocked": false,
            "brandDetails.isDeleted": false,
          },
        },
        {
          $group: {
            _id: "$brandDetails._id",
            brandName: { $first: "$brandDetails.brandName" },
            totalSales: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.priceAtPurchase"] } },
            totalQuantity: { $sum: "$orderedItems.quantity" },
            totalOrders: { $addToSet: "$_id" }, // Collect unique order IDs
          },
        },
        {
          $addFields: {
            totalOrdersCount: { $size: { $ifNull: ["$totalOrders", []] } },
            averageOrderValue: {
              $cond: {
                if: { $gt: [{ $size: { $ifNull: ["$totalOrders", []] } }, 0] },
                then: { $divide: ["$totalSales", { $size: { $ifNull: ["$totalOrders", []] } }] },
                else: 0
              }
            }
          },
        },
        { $sort: { totalSales: -1 } },
        { $limit: 10 },
      ]);
      const topCategories = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
            $match: {
                "orderedItems.status": { 
                    $nin: ["Cancelled", "Returned", "Return Requested", "Failed"] 
                },
                createdAt: { $gte: dayStart, $lte: dayEnd },
            },
        },
        {
            $lookup: {
                from: "products",
                localField: "orderedItems.product",
                foreignField: "_id",
                as: "product",
            },
        },
        { $unwind: "$product" },
        {
            $lookup: {
                from: "categories",
                localField: "product.category",
                foreignField: "_id",
                as: "category",
            },
        },
        { $unwind: "$category" },
        {
            $match: {
                "category.isListed": true,
                "product.isBlocked": false,
            },
        },
        {
            $group: {
                _id: "$category._id",
                categoryName: { $first: "$category.name" },
                totalOrders: { $sum: 1 },
                totalQuantitySold: { $sum: "$orderedItems.quantity" }, // No need for $toDouble if stored as Number
                totalRevenue: {
                    $sum: {
                        $multiply: ["$orderedItems.quantity", "$orderedItems.priceAtPurchase"]
                    },
                },
            },
        },
        {
            $project: {
                _id: 1,
                categoryName: 1,
                totalOrders: 1,
                totalQuantitySold: 1,
                totalRevenue: { $round: ["$totalRevenue", 2] },
                averageOrderValue: {
                    $round: [
                        { 
                            $cond: { 
                                if: { $eq: ["$totalOrders", 0] }, 
                                then: 0, 
                                else: { $divide: ["$totalRevenue", "$totalOrders"] } 
                            } 
                        }, 
                        2
                    ],
                },
            },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
    ]);
  
      const totalOrders = await Order.countDocuments({
        createdAt: { $gte: dayStart, $lte: dayEnd },
      });
  
      const activeOrders = await Order.countDocuments({
        "orderedItems.status": { $in: ["Pending", "Processing"] }, // Check at item level
        createdAt: { $gte: dayStart, $lte: dayEnd }, // Date filter
      });
  
      const cancelledItemsResult = await Order.aggregate([
        { $unwind: "$orderedItems" }, // Break orders into individual items
        {
          $match: {
            "orderedItems.status": "Cancelled", // Filter only cancelled items
            createdAt: { $gte: dayStart, $lte: dayEnd }, // Filter by date range
          },
        },
        {
          $group: {
            _id: null,
            totalCancelledItems: { $sum: "$orderedItems.quantity" }, // Sum cancelled item quantities
          },
        },
      ]);
      
      // Extract the total cancelled items count
      const cancelledItems = cancelledItemsResult.length > 0 ? cancelledItemsResult[0].totalCancelledItems : 0;
      
  
      const completedOrders = await Order.aggregate([
        {
            $match: { 
                createdAt: { $gte: dayStart, $lte: dayEnd } 
            }
        },
        {
            $project: {
                allCompleted: {
                    $allElementsTrue: { 
                        $map: { 
                            input: "$orderedItems", 
                            as: "item", 
                            in: { 
                                $in: ["$$item.status", ["Delivered"]]  // Allow both "Delivered" and "Returned"
                            } 
                        }
                    }
                }
            }
        },
        {
            $match: { allCompleted: true }  // Only orders where all items are Delivered or Returned
        },
        {
            $count: "completedOrders"
        }
    ]);
    const completedOrdersCount = completedOrders.length > 0 ? completedOrders[0].completedOrders : 0;
    
    
  
      const returnedItemsResult = await Order.aggregate([
        { $unwind: "$orderedItems" }, // Break orders into individual items
        {
          $match: {
            "orderedItems.status": "Returned", // Filter only returned items
            createdAt: { $gte: dayStart, $lte: dayEnd }, // Filter by date range
          },
        },
        {
          $group: {
            _id: null,
            totalReturnedItems: { $sum: "$orderedItems.quantity" }, // Sum returned item quantities
          },
        },
      ]);
      
      // Extract the total returned items count
      const returnedItems = returnedItemsResult.length > 0 ? returnedItemsResult[0].totalReturnedItems : 0;
      
  
      const totalRevenueResult = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: dayStart, $lte: dayEnd },
                "orderedItems.status": "Delivered" // Ensure at least one delivered item exists
            }
        },
        {
            $group: {
                _id: "$_id", // Group by Order ID
                finalAmount: { $first: "$finalAmount" } // Keep finalAmount per order
            }
        },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: "$finalAmount" } // Sum up all finalAmounts
            }
        }
    ]);
      const totalDiscountResult = await Order.aggregate([
        {
          $match: {
            status: { $nin: ["Cancelled", "Returned", "Return Request", "Failed"] },
          },
        },
        { $unwind: "$orderedItems" },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.product",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        { $unwind: "$productDetails" },
        {
          $addFields: {
            salePrice: { $toDouble: { $ifNull: ["$productDetails.salePrice", 0] } },
            realPrice: { $toDouble: "$productDetails.realPrice" },
            productOffer: { $toDouble: { $ifNull: ["$productDetails.productOffer", 0] } },
          },
        },
        {
          $addFields: {
            effectiveDiscount: {
              $cond: {
                if: { $gt: ["$salePrice", 0] },
                then: { $subtract: ["$realPrice", "$salePrice"] },
                else: { $multiply: ["$realPrice", { $divide: ["$productOffer", 100] }] },
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            totalDiscount: {
              $sum: {
                $multiply: [{ $toDouble: "$orderedItems.quantity" }, "$effectiveDiscount"],
              },
            },
          },
        },
      ]);
  
      const couponDiscountResult = await Order.aggregate([
        {
          $group: {
            _id: null,
            couponDiscount: { $sum: { $ifNull: ["$couponDiscount", 0] } },
          },
        },
      ]);
  
      const totalRevenue = parseFloat((totalRevenueResult[0]?.totalRevenue || 0).toFixed(2));
      const couponDiscount = couponDiscountResult[0]?.couponDiscount || 0;
      const numberOfCustomers = await User.countDocuments();
      const totalDiscount = parseFloat((totalDiscountResult[0]?.totalDiscount || 0).toFixed(2));
  
      res.render("admin/adminDashboard", {
        currentPage: "dashboard",
        totalOrders,
        activeOrders,
        cancelledItems,
        completedOrdersCount,
        returnedItems,
        totalRevenue,
        totalDiscount,
        couponsApplied: await Order.countDocuments({ couponDiscount: { $gt: 0 } }),
        numberOfCustomers,
        couponDiscount,
        totalRevenueForSales,
        topProducts,
        topBrands,
        topCategories,
        filterValue, // Inject into EJS
        startDate,   // Inject into EJS
        endDate,     // Inject into EJS
        selectedFilter: filterValue || "all",
      });
  
    } catch (error) {
      console.error("Error while loading dashboard:", error);
      res.redirect("/pageError");
    }
  };
  

  const filteredAdminDashboard = async (req, res) => {
    try {
        const { startDate, endDate, filterValue } = req.query;
        
        let dayStart, dayEnd;
        const today = new Date();
        
        switch (filterValue) {
            case "daily":
                dayStart = new Date();
                dayStart.setHours(0, 0, 0, 0);
                dayEnd = new Date();
                dayEnd.setHours(23, 59, 59, 999);
                break;
            case "weekly":
                const currentDay = today.getDay();
                dayStart = new Date(today);
                dayStart.setDate(today.getDate() - currentDay);
                dayStart.setHours(0, 0, 0, 0);
                
                dayEnd = new Date(dayStart);
                dayEnd.setDate(dayStart.getDate() + 6);
                dayEnd.setHours(23, 59, 59, 999);
                break;
            case "monthly":
                dayStart = new Date(today.getFullYear(), today.getMonth(), 1);
                dayEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                dayEnd.setHours(23, 59, 59, 999);
                break;
            case "yearly":
                dayStart = new Date(today.getFullYear(), 0, 1);
                dayEnd = new Date(today.getFullYear(), 11, 31);
                dayEnd.setHours(23, 59, 59, 999);
                break;
            case "custom":
                if (startDate && endDate) {
                    dayStart = new Date(startDate);
                    dayEnd = new Date(endDate);
                    dayEnd.setHours(23, 59, 59, 999);
                    if (dayStart > dayEnd) {
                        return res.status(400).json({ error: "Start date cannot be after end date." });
                    }
                }
                break;
            default:
                dayStart = new Date(0);
                dayEnd = new Date();
        }
        
        // Fetch order statistics
        const orderStats = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: dayStart, $lte: dayEnd },
                    overallStatus: { $nin: ["Cancelled", "Returned", "Return Requested", "Failed"] },
                },
            },
            {
                $group: {
                    _id: null,
                    completed: { $sum: { $cond: [{ $eq: ["$overallStatus", "Delivered"] }, 1, 0] } },
                    active: { $sum: { $cond: [{ $in: ["$overallStatus", ["Pending", "Processing"]] }, 1, 0] } },
                    cancelled: { $sum: { $cond: [{ $eq: ["$overallStatus", "Cancelled"] }, 1, 0] } },
                    returned: { $sum: { $cond: [{ $eq: ["$overallStatus", "Returned"] }, 1, 0] } },
                    
                },
            },
        ]);
        const totalRevenueForSales = await Order.aggregate([
          {
            $match: {
                createdAt: { $gte: dayStart, $lte: dayEnd },
                "orderedItems.status": "Delivered", // Only include orders with at least one delivered item
            },
        },
        {
            $group: {
                _id: { $dateToString: { format: groupByFormat, date: "$createdAt" } },
                totalRevenue: { $sum: "$finalAmount" },
            },
        },
        { $sort: { _id: 1 } },
      ]);

        
        // Fetch top brands
        const topBrands = await Order.aggregate([
            { $match: { createdAt: { $gte: dayStart, $lte: dayEnd } } },
            { $unwind: "$orderedItems" },
            {
                $lookup: {
                    from: "products",
                    localField: "orderedItems.product",
                    foreignField: "_id",
                    as: "productDetails",
                },
            },
            { $unwind: "$productDetails" },
            {
                $match: { "productDetails.isBlocked": false },
            },
            {
                $lookup: {
                    from: "brands",
                    localField: "productDetails.brand",
                    foreignField: "_id",
                    as: "brandDetails",
                },
            },
            { $unwind: "$brandDetails" },
            {
                $match: { "brandDetails.isBlocked": false, "brandDetails.isDeleted": false },
            },
            {
                $group: {
                    _id: "$brandDetails._id",
                    brandName: { $first: "$brandDetails.brandName" },
                    totalSales: { $sum: { $multiply: ["$orderedItems.quantity", "$orderedItems.price"] } },
                    totalOrders: { $sum: 1 },
                },
            },
            { $sort: { totalSales: -1 } },
            { $limit: 10 },
        ]);
        
        // Fetch top categories
        const topCategories = await Order.aggregate([
            { $match: { createdAt: { $gte: dayStart, $lte: dayEnd } } },
            { $unwind: "$orderedItems" },
            {
                $lookup: {
                    from: "products",
                    localField: "orderedItems.product",
                    foreignField: "_id",
                    as: "product",
                },
            },
            { $unwind: "$product" },
            {
                $lookup: {
                    from: "categories",
                    localField: "product.category",
                    foreignField: "_id",
                    as: "category",
                },
            },
            { $unwind: "$category" },
            {
                $match: { "category.isListed": true, "product.isBlocked": false },
            },
            {
                $group: {
                    _id: "$category._id",
                    categoryName: { $first: "$category.name" },
                    totalRevenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } },
                    totalOrders: { $sum: 1 },
                },
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
        ]);
        
        res.json({
            orderStats: orderStats[0] || {},
            totalRevenueForSales,
            topBrands,
            topCategories,
            filterValue, // Inject into EJS
            startDate,   // Inject into EJS
            endDate,     // Inject into EJS
        });
    } catch (error) {
        console.error("Error in filteredAdminDashboard:", error);
        res.status(500).json({ error: "Failed to fetch filtered dashboard data", details: error.message });
    }
};
  


  
  // Function to load the sales page
  const loadSalesPage = async (req, res) => {
    try {
        // Get all orders where at least one item is delivered
        const deliveredOrders = await Order.find({
            "orderedItems.status": "Delivered"
        }).populate("user", "name"); // Populate user name

        // Calculate total revenue from delivered orders
        const totalRevenueResult = await Order.aggregate([
            { $unwind: "$orderedItems" },
            { $match: { "orderedItems.status": "Delivered" } }, // Filter delivered items
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$finalAmount" }, // Sum final amount of delivered orders
                },
            },
        ]);

        // Calculate total discount from delivered items
        const totalDiscountResult = await Order.aggregate([
            { $unwind: "$orderedItems" },
            { $match: { "orderedItems.status": "Delivered" } }, // Only delivered items
            {
                $group: {
                    _id: null,
                    totalDiscount: { $sum: "$totalDiscount" },
                },
            },
        ]);

        // Calculate coupon discounts applied
        const couponDiscountResult = await Order.aggregate([
            { $match: { "orderedItems.status": "Delivered" } }, // Only delivered orders
            {
                $group: {
                    _id: null,
                    couponDiscount: { $sum: "$couponDiscount" },
                },
            },
        ]);

        // Count different order statuses
        const totalOrders = deliveredOrders.length;
        const activeOrders = await Order.countDocuments({ status: { $in: ["Pending", "Processing"] } });
        const cancelledOrders = await Order.countDocuments({ status: "Cancelled" });
        const completedOrders = await Order.countDocuments({ status: "Delivered" });
        const returnedOrders = await Order.countDocuments({ status: "Returned" });

        // Get number of customers who placed orders
        const numberOfCustomers = await User.countDocuments();

        // Convert numbers to fixed 2 decimal places
        const totalRevenue = (totalRevenueResult[0]?.totalRevenue || 0).toFixed(2);
        const totalDiscount = (totalDiscountResult[0]?.totalDiscount || 0).toFixed(2);
        const couponDiscount = (couponDiscountResult[0]?.couponDiscount || 0).toFixed(2);

        // Render sales page with filtered data
        res.render("admin/salesPage", {
            currentPage: "sales",
            totalRevenue,
            totalDiscount,
            totalOrders,
            orders: deliveredOrders, // Only show orders with delivered items
            activeOrders,
            cancelledOrders,
            completedOrders,
            returnedOrders,
            couponDiscount,
            numberOfCustomers,
        });

    } catch (error) {
        console.error("Error in loading sales page in adminController", error);
        res.redirect("/pageError");
    }
};

  
  // Function to filter sales report based on date range
  const filterSalesReport = async (req, res) => {
    try {
        const { reportType, startDate, endDate } = req.query;
        const currentDay = new Date();
        let startDay, endDay;

        if (startDate && endDate) {
            startDay = new Date(startDate);
            endDay = new Date(endDate);
            endDay.setHours(23, 59, 59, 999);
        } else {
            switch (reportType) {
                case "daily":
                    startDay = new Date();
                    startDay.setHours(0, 0, 0, 0);
                    endDay = new Date();
                    endDay.setHours(23, 59, 59, 999);
                    break;
                case "weekly":
                    startDay = new Date();
                    const dayOfWeek = currentDay.getDay();
                    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                    startDay.setDate(currentDay.getDate() - diff);
                    startDay.setHours(0, 0, 0, 0);
                    endDay = new Date(startDay);
                    endDay.setDate(startDay.getDate() + 6);
                    endDay.setHours(23, 59, 59, 999);
                    break;
                case "monthly":
                    startDay = new Date(currentDay.getFullYear(), currentDay.getMonth(), 1);
                    endDay = new Date(currentDay.getFullYear(), currentDay.getMonth() + 1, 0);
                    endDay.setHours(23, 59, 59, 999);
                    break;
                default:
                    startDay = new Date(0);
                    endDay = new Date();
            }
        }

        // Fetch only orders that have at least one delivered item
        const orders = await Order.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDay, $lte: endDay },
                    "orderedItems.status": "Delivered", // Ensures at least one delivered item
                },
            },
            { $unwind: "$orderedItems" }, // Separate ordered items
            { $match: { "orderedItems.status": "Delivered" } }, // Only keep delivered items
            {
                $lookup: {
                    from: "products",
                    localField: "orderedItems.product",
                    foreignField: "_id",
                    as: "productDetails",
                },
            },
            { $unwind: "$productDetails" },
            {
                $addFields: {
                    effectiveDiscount: {
                        $cond: [
                            { $ifNull: ["$productDetails.salePrice", false] },
                            { $subtract: ["$productDetails.realPrice", "$productDetails.salePrice"] },
                            { $multiply: ["$productDetails.realPrice", { $divide: ["$productDetails.productOffer", 100] }] },
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: "$_id",
                    createdAt: { $first:"$createdAt" },
                    finalAmount: { $first:"$finalAmount" }, 
                    couponDiscount: { $first:"$couponDiscount" },
                    totalDiscount: { $sum:{ $multiply: ["$orderedItems.quantity", "$effectiveDiscount"] } },
                },
            },
            { $sort: { createdAt: -1 } },
        ]);

        // Calculate sales report totals
        const orderTotal = orders.reduce((sum, order) => sum + (order.finalAmount  || 0), 0);
        const couponDiscount = orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0);
        const totalDiscount = orders.reduce((sum, order) => sum + (order.totalDiscount || 0), 0);

        // Count number of orders with coupons applied
        const couponsApplied = await Order.countDocuments({ couponApplied: true, "orderedItems.status": "Delivered" });

        console.log({ orderTotal, couponDiscount, totalDiscount });

        res.render("admin/salesPage", {
            currentPage: "sales",
            orders,
            totalRevenue: orderTotal.toFixed(2),
            totalDiscount: totalDiscount.toFixed(2),
            couponDiscount: couponDiscount.toFixed(2),
            couponsApplied,
            totalOrders: orders.length,
        });
    } catch (error) {
        console.error("Error in filtering sales report:", error);
        res.redirect("/pageError");
    }
};


  
  
  // Function to fetch orders by date range
  const ordersByDateRange = async (startDate, endDate) => {
    try {
        console.log("startDate:", startDate);
        console.log("endDate:", endDate);

        if (!startDate || !endDate) {
            throw new Error("Start date or end date is missing.");
        }

        const startDay = new Date(startDate);
        const endDay = new Date(endDate);
        
        // Ensure endDay covers the full day
        endDay.setHours(23, 59, 59, 999);

        if (isNaN(startDay.getTime()) || isNaN(endDay.getTime())) {
            throw new Error("Invalid date format. Please use 'YYYY-MM-DD'.");
        }

        // Fetch only orders that have at least one delivered item
        const orders = await Order.find({
            createdAt: { $gte: startDay, $lte: endDay },
            "orderedItems.status": "Delivered", // Ensures at least one delivered item
        })
        .populate('user', 'name email phone') // Fetch user details
        .sort({ createdAt: -1 });

        return orders;
    } catch (error) {
        console.error("Error fetching orders by date range:", error.message);
        throw error;
    }
};

  
  // Excel Report
  const excelReportDownload = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const orders = await Order.find({
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
            "orderedItems.status": "Delivered"
        })
        .populate({
            path: "orderedItems.product",
            select: "name" // ✅ Ensure we fetch the product name
        })
        .populate("user", "name email phone")
        .sort({ createdAt: -1 });

        if (!orders.length) {
            return res.status(404).json({ message: "No orders found in this date range" });
        }

        const workbook = new exceljs.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        // 🔹 Sales Report Title
        worksheet.mergeCells('A1:E1');
        worksheet.getCell('A1').value = "Sales Report";
        worksheet.getCell('A1').font = { bold: true, size: 16 };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };

        // 🔹 Period Range
        worksheet.mergeCells('A2:E2');
        worksheet.getCell('A2').value = `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
        worksheet.getCell('A2').font = { italic: true };
        worksheet.getCell('A2').alignment = { horizontal: 'center' };

        let totalRevenue = 0;
        let totalCouponDiscount = 0;
        let totalDeliveredOrders = 0;

        orders.forEach(order => {
            const deliveredItems = order.orderedItems.filter(item => item.status === "Delivered");
            if (deliveredItems.length === 0) return;

            totalDeliveredOrders++;
            totalRevenue += order.finalAmount;
            totalCouponDiscount += order.couponDiscount ?? 0;
        });

        // 🔹 Add Summary Section (like PDF)
        worksheet.addRow([]);
        worksheet.addRow([`Total Delivered Orders:`, totalDeliveredOrders]);
        worksheet.addRow([`Total Amount:`, `₹${totalRevenue.toFixed(2)}`]);
        worksheet.addRow([`Total Coupon Discount:`, `₹${totalCouponDiscount.toFixed(2)}`]);
        worksheet.addRow([]); // Blank row for spacing

        worksheet.getRow(5).font = { bold: true };
        worksheet.getRow(6).font = { bold: true };
        worksheet.getRow(7).font = { bold: true };

        // 🔹 Column Headers
        worksheet.addRow([
            'Order ID',
            'Date',
            'Customer Name',
            'Email',
            'Phone',
            'Product Name',
            'Quantity',
            'Real Price',
            'Coupon Discount',
            'Final Amount',
            'Payment Method'
        ]).font = { bold: true };

        orders.forEach(order => {
            const deliveredItems = order.orderedItems.filter(item => item.status === "Delivered");

            deliveredItems.forEach((item, index) => {
                worksheet.addRow([
                    index === 0 ? order._id.toString() : '',
                    index === 0 ? new Date(order.createdAt).toLocaleDateString() : '',
                    index === 0 ? order.user?.name || 'N/A' : '',
                    index === 0 ? order.user?.email || 'N/A' : '',
                    index === 0 ? order.user?.phone || 'N/A' : '',
                    item.product?.name || item.productName || 'Unknown Product',
                    item.quantity || 1,
                    (item.priceAtPurchase ?? 0).toFixed(2),
                    index === 0 ? (order.couponDiscount ?? 0).toFixed(2) : '',
                    index === 0 ? order.finalAmount.toFixed(2) : '',
                    index === 0 ? order.paymentMethod || 'N/A' : ''
                ]);
            });
        });

        worksheet.columns.forEach(column => {
            column.width = 18;
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("❌ Error in downloading excel report:", error);
        res.status(500).send("Error generating report");
    }
};


  
  // PDF Report
  const downloadPDFreport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).send("Start and end dates are required.");
        }

        const orders = await ordersByDateRange(startDate, endDate);
        const doc = new PDFDocument({ margin: 30 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=sales-report.pdf");
        doc.pipe(res);

        // Header Section
        doc.fontSize(16).text("Sales Report", { align: "center", underline: true });
        doc.moveDown();
        doc.fontSize(9).text(`Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`, { align: "center" });
        doc.moveDown(1);




        let filteredOrders = orders.filter(order => order.orderedItems.some(item => item.status === "Delivered"));
         // Totals Summary
         let totalAmount = 0;
         let totalCouponDiscount = 0;
 
         filteredOrders.forEach(order => {
             totalAmount += order.finalAmount;
             totalCouponDiscount += order.couponDiscount || 0;
         });
 
         doc.fontSize(12).text(`Total Delivered Orders: ${filteredOrders.length}`);
         doc.text(`Total Amount: ₹${totalAmount.toFixed(2)}`);
         doc.text(`Total Coupon Discount: ₹${totalCouponDiscount.toFixed(2)}`);
         doc.moveDown(3);

        const columnWidths = [50, 40, 50, 50, 50, 50, 40, 100, 40, 50];
        const rowHeight = 25;

        const drawRow = (columns, yPos, bold = false) => {
            if (bold) doc.font("Helvetica-Bold");
            else doc.font("Helvetica");

            columns.forEach((col, i) => {
                doc.rect(40 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), yPos, columnWidths[i], rowHeight).stroke();
                doc.fontSize(6).text(col, 42 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), yPos + 8, {
                    width: columnWidths[i] - 4,
                    align: "left",
                });
            });
        };

        // Display Table Header
        drawRow([
            "Order ID", "Date", "Customer", "Phone", "Payment", "Amount", "Coupon", "Product Name", "Quantity", "Price"
        ], doc.y, true);

        filteredOrders.forEach(order => {
            const orderYPos = doc.y + rowHeight;
            drawRow([
                order._id,
                new Date(order.createdAt).toLocaleDateString(),
                order.user?.name || "N/A",
                order.user?.phone || "N/A",
                order.paymentMethod,
                `₹${order.finalAmount.toFixed(2)}`,
                `₹${order.couponDiscount.toFixed(2)}`,
                "", "", ""
            ], orderYPos);

            order.orderedItems.filter(item => item.status === "Delivered").forEach(item => {
                if (doc.y > doc.page.height - 150) {
                    doc.addPage();
                    drawRow([
                        "Order ID", "Date", "Customer", "Phone", "Payment", "Amount", "Coupon", "Product Name", "Quantity", "Price"
                    ], doc.y, true);
                }

                drawRow([
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    item.productName,
                    `x${item.quantity}`,
                    `₹${item.priceAtPurchase.toFixed(2)}`
                ], doc.y + rowHeight);
            });
        });

        doc.end();
    } catch (error) {
        console.error("Error generating PDF report:", error.message);
        res.status(500).send("Error generating report");
    }
};






 

 

  module.exports = {
    pageError,
    loadAdminLogin,
    verifyLogin,
    securePassword,
    logout,
    loadSalesPage,
    filterSalesReport,
    excelReportDownload,
    downloadPDFreport,
    ordersByDateRange,
    filteredAdminDashboard,
    loadDashboard
  };