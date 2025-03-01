const Cart = require('../../Models/cartModel');
const Product = require('../../Models/productModel');
const User=require('../../Models/userModel')
const Coupon=require('../../Models/couponModel')
const Wishlist = require('../../Models/wishlistModel');
const { verifyCoupon } = require('../../controllers/admin/couponController');
const axios = require('axios');

// Controller for applying a coupon
const applyCoupon = async (req, res) => {
    try {
        const { couponCode, cartTotal } = req.body;

        const response = await axios.post('http://localhost:3000/coupons/verifyCoupon', { couponCode, cartTotal });

        if (response.data.success) {
            req.session.coupon = couponCode;
            req.session.couponReduction = response.data.couponReduction;

            return res.status(200).json({
                success: true,
                message: response.data.message,
                couponReduction: response.data.couponReduction,
                discount: req.session.discount
            });
        } else {
            return res.status(400).json({
                success: false,
                message: response.data.message,
            });
        }
    } catch (error) {
        console.error('Error applying coupon:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


const loadCart = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const userCart = await Cart.findOne({ userId }).populate('items.productId');
        
        // Declare cart count
        let cartCount = userCart ? userCart.items.length : 0;
        console.log(cartCount);

        let relatedProducts = [];
        if (!userCart || userCart.items.length === 0) {
            // Fetch random product recommendations
            relatedProducts = await Product.find({ isBlocked: false }).limit(6);
            return res.render('users/cart', {
                items: [],
                cartTotal: 0,
                discount: 0,
                couponReduction: 0,
                coupon: null,
                message: 'Your cart is empty.',
                relatedProducts,
                user: userData,
                cartCount
            });
        }

        // Initialize totals
        let cartTotal = 0;
        let totalDiscount = 0;
        let couponReduction = 0;

        // Calculate cart totals
        const items = userCart.items.map(item => {
            if (!item.productId) return null;

            const regularPrice = item.productId.realPrice || 0;
            const salePrice = item.productId.salePrice || regularPrice;
            const discount = regularPrice - salePrice;

            if (!item.productId.isBlocked) {
                cartTotal += item.totalPrice;
                totalDiscount += discount * item.quantity;
            }

            return {
                ...item.toObject(),
                discount: discount.toFixed(2),
                isBlocked: item.productId.isBlocked,
                unavailableMessage: item.productId.isBlocked ? 'This product is unavailable.' : null,
            };
        }).filter(Boolean);

        // Fetch related products based on cart categories
        const cartProductCategories = userCart.items
            .map(item => item.productId.category)
            .filter(category => category);

        relatedProducts = await Product.find({
            category: { $in: cartProductCategories },
            _id: { $nin: userCart.items.map(item => item.productId._id) },
            isBlocked: false,
        }).limit(6);

        // Handle applied coupon
        const appliedCoupon = req.query.coupon || req.session.coupon || null;

        if (appliedCoupon && !req.session.coupon) {
            try {
                const response = await verifyCoupon({ body: { couponCode: appliedCoupon, cartTotal } }, res);
                if (response.success) {
                    couponReduction = response.couponReduction;
                    req.session.coupon = appliedCoupon;
                    req.session.couponReduction = couponReduction;
                    req.session.save(err => {
                        if (err) console.error('Session save error:', err);
                    });
                } else {
                    console.log(response.message);
                }
            } catch (err) {
                console.error("Coupon verification error:", err);
            }
        }

        // Render the cart page
        res.render('users/cart', {
            items,
            cartTotal: parseFloat(cartTotal.toFixed(2)),
            discount: parseFloat(totalDiscount.toFixed(2)),
            couponReduction: parseFloat(couponReduction.toFixed(2)),
            coupon: req.session.coupon || null,
            message: '',
            relatedProducts,
            user: userData,
            cartCount
        });
    } catch (error) {
        console.error('Error loading cart:', error);
        res.status(500).send('Internal server error');
    }
};



// Controller for adding an item to the cart
const addItemToCart = async (req, res) => {
    const { productId, quantity ,removeFromWishlist} = req.body;
    const userId = req.session.user;

    try {
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User not logged in' });
        }

        if (!productId || !quantity) {
            return res.status(400).json({ success: false, message: 'Product ID and quantity are required' });
        }

        let cart = await Cart.findOne({ userId: userId });
        if (!cart) {
            cart = new Cart({ userId: userId, items: [] });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const productIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        let newQuantity = quantity;

        if (productIndex !== -1) {
            newQuantity += cart.items[productIndex].quantity;
            cart.items[productIndex].quantity = newQuantity;
            cart.items[productIndex].totalPrice = product.salePrice * newQuantity;
            return res.status(200).json({ 
                success: false, 
                message: 'Product is already in your cart. Update quantity in the cart if needed.' 
            });
        } else {
            cart.items.push({
                productId,
                quantity: newQuantity,
                price: product.salePrice,
                totalPrice: product.salePrice * newQuantity
            });
        }

        if(removeFromWishlist){
            const wishlist=await Wishlist.findOne({userId:userId});
            if(wishlist){
                wishlist.products=wishlist.products.filter(item=>item.productId.toString()!==productId);
                await wishlist.save();
            }
        }

        await cart.save();
        res.status(200).json({ success: true, message: 'Item added to cart', cart });
    } catch (error) {
        console.error("Error adding item to cart:", error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

// Controller for removing an item from the cart
const removeItemFromCart = async (req, res) => {
    const { productId } = req.body;
    const userId = req.session.user;
    try {
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }
        cart.items = cart.items.filter(item => item.productId.toString() !== productId);
        await cart.save();
        res.status(200).json({ success: true, message: 'Item has been removed from cart' });
    }
    catch (error) {
        console.error("Error removing the item from cart:", error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
// Controller for updating the quantity of an item
const updateQuantity = async (req, res) => {
    const { productId, quantity } = req.body;
    const userId = req.session.user;
    try {
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(400).json({ success: false, message: 'Cart not found' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const item = cart.items.find(item => item.productId.toString() === productId);
        if (item) {
            if (quantity > 3) {
                return res.status(400).json({ success: false, message: 'You can only purchase a maximum of 3 units per product' });
            }
            item.quantity = quantity;
            item.totalPrice = item.price * quantity;
            await cart.save();
            res.status(200).json({ success: true, message: 'Item quantity updated', cart });
        } else {
            res.status(404).json({ success: false, message: 'Item not found in cart' });
        }
    } catch (error) {
        console.error("Error updating item quantity:", error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
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

 



module.exports = {
    loadCart,
    addItemToCart,
    removeItemFromCart,
    updateQuantity,
    applyCoupon,
    setCartCount
}