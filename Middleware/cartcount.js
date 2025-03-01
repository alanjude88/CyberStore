const Cart = require("../Models/cartModel.js");

const setCartCount = async (req, res, next) => {
    try {
        if (req.session.user) {
            const userCart = await Cart.findOne({ userId: req.session.user });
            res.locals.cartCount = userCart ? userCart.items.length : 0;
        } else {
            res.locals.cartCount = 0;
        }
    } catch (error) {
        console.error("Error fetching cart count:", error);
        res.locals.cartCount = 0;
    }
    next();
};

module.exports = setCartCount;