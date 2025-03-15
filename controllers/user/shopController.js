const Product = require("../../Models/productModel");
const Category = require("../../Models/categoryModel");
const Brand = require("../../Models/brandModel");
const User = require("../../Models/userModel");
const Order = require("../../Models/orderModel");
const Cart = require("../../Models/cartModel");
const Wallet = require("../../Models/walletModel");
const Address = require("../../Models/addressModel");
const Wishlist = require("../../Models/wishlistModel");
const mongoose = require("mongoose");

//function to calculate discount
function calculateDiscount(realPrice, salePrice) {
  if (realPrice <= 0) return 0;
  return Math.round(((realPrice - salePrice) / realPrice) * 100);
}

//function to load shop
const loadShop = async (req, res) => {
  try {
    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || "default";
    const minPrice = parseInt(req.query.minPrice) || 5000;
    const maxPrice = parseInt(req.query.maxPrice) || 500000;
    const searchWord = req.query.searchWord ? req.query.searchWord.trim() : "";

    // Get selected filters from query params
    const selectedCategories = Array.isArray(req.query.categories)
      ? req.query.categories
      : req.query.categories
      ? [req.query.categories]
      : [];

    const selectedBrands = Array.isArray(req.query.brands)
      ? req.query.brands
      : req.query.brands
      ? [req.query.brands]
      : [];

    // Base query conditions
    let queryConditions = [
      { isBlocked: false },
      {
        $or: [
          { salePrice: { $gte: minPrice, $lte: maxPrice } },
          { realPrice: { $gte: minPrice, $lte: maxPrice } }
        ],
      },
    ];

    if (selectedCategories.length) {
      queryConditions.push({ category: { $in: selectedCategories } });
    }
    if (selectedBrands.length) {
      queryConditions.push({ brand: { $in: selectedBrands } });
    }

    // Handle searchWord and match it with products, brands, and categories
    if (searchWord) {
      const [categoryIds, brandIds] = await Promise.all([
        Category.find({ name: { $regex: searchWord, $options: "i" } }).distinct("_id"),
        Brand.find({ name: { $regex: searchWord, $options: "i" } }).distinct("_id"),
      ]);

      queryConditions.push({
        $or: [
          { productName: { $regex: searchWord, $options: "i" } },
          { description: { $regex: searchWord, $options: "i" } },
          { category: { $in: categoryIds } },
          { brand: { $in: brandIds } },
        ],
      });
    }

    let query = { $and: queryConditions };

    // Define sorting options
    const sortOptions = {
      priceLowHigh: { salePrice: 1 },
      priceHighLow: { salePrice: -1 },
      featured: { quantity: -1 },
      newArrivals: { createdAt: -1 },
      aToZ: { productName: 1 },
      zToA: { productName: -1 },
    };

    let sortCriteria = sortOptions[sortBy] || { createdAt: -1 };

    // Fetch all required data concurrently
    const results = await Promise.allSettled([
      User.findById(userId),
      Cart.findOne({ userId }),
      Product.find(query).sort(sortCriteria).skip(skip).limit(limit),
      Product.countDocuments(query),
      Category.find({ isListed: true }),
      Brand.find({ isBlocked: false }),
      Order.aggregate([
        { $unwind: "$orderedItems" },
        { $group: { _id: "$orderedItems.product", totalSold: { $sum: "$orderedItems.quantity" } } },
        { $sort: { totalSold: -1 } },
        { $limit: 6 },
      ]),
      userId ? Wishlist.findOne({ userId }) : null,
    ]);

    // Extract values safely
    const [
      userData,
      userCart,
      products,
      totalProducts,
      categories,
      brands,
      bestSellers,
      userWishlist,
    ] = results.map((result) => (result.status === "fulfilled" ? result.value : null));

    // Redirect if requested page is out of range
    if (page > Math.ceil(totalProducts / limit) && totalProducts > 0) {
      return res.redirect(`/shop?page=${Math.ceil(totalProducts / limit)}`);
    }

    // Get cart count
    const cartCount = userCart ? userCart.items.length : 0;

    // Fetch best-selling products
    const bestSellerProducts = bestSellers.length
      ? await Product.find({ _id: { $in: bestSellers.map((product) => product._id) } })
      : [];

    // Calculate discount for each product
    products.forEach((product) => {
      product.discountPercentage = calculateDiscount(product.realPrice, product.salePrice);
      product.discountAmount = (product.realPrice - product.salePrice).toFixed(2);
    });

    // Get wishlist products
    const wishListProducts = userWishlist ? userWishlist.products.map((item) => item.productId) : [];

    // Render shop page with all data
    res.render("users/shop", {
      user: userData,
      products,
      categories,
      brands,
      currentPage: "shop",
      totalPages: Math.ceil(totalProducts / limit),
      limit,
      selectedCategories,
      selectedBrands,
      sortWays: sortBy,
      minPrice,
      maxPrice,
      searchWord,
      bestSellers: bestSellerProducts,
      wishListProducts,
      cartCount,
    });
  } catch (error) {
    console.error("Error while loading shop:", error);
    res.redirect("/pageError");
  }
};




module.exports = {
  loadShop,
};