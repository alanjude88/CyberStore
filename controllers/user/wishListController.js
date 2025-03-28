const Wishlist = require('../../Models/wishlistModel');
const Product = require('../../Models/productModel');
const Category = require('../../Models/categoryModel');
const Brand = require('../../Models/brandModel');
const StatusCodes = require('../../util/statusCodes');


const loadWishlist = async (req, res) => {
    try {
        // Check if the user is logged in
        if (!req.session || !req.session.user) {
            return res.render('users/wishlist', {
                wishlist: { products: [] },
                totalPages: 0,
                currentPage: 1,
                isLoggedIn: false,
            });
        }

        const userId = req.session.user._id;
        const wishlist = await Wishlist.findOne({ userId })
            .populate({
                path: 'products.productId',
                select: 'productName productImage realPrice salePrice brand category',
            })
            .populate('products.productId.category')
            .populate('products.productId.brand');

        if (!wishlist || wishlist.products.length === 0) {
            return res.render('users/wishlist', {
                wishlist: { products: [] },
                totalPages: 0,
                currentPage: 1,
                isLoggedIn: true, 
            });
        }

        wishlist.products.sort((a, b) => b.addedOn - a.addedOn);

        const itemsPerPage = 6;
        const page = parseInt(req.query.page) || 1;
        const totalPages = Math.ceil(wishlist.products.length / itemsPerPage);
        const pageProducts = wishlist.products.slice((page - 1) * itemsPerPage, page * itemsPerPage);

        res.render('users/wishlist', {
            user: userId,
            wishlist: { products: pageProducts },
            totalPages,
            currentPage: page,
            isLoggedIn: true, 
        });
    } catch (error) {
        console.error('Error loading wishlist:', error);
        res.status(500).send({ message: 'Error loading wishlist' });
    }
};


const addToWishlist = async (req, res) => {
    try {
        

        if (!req.session.user || !req.session.user._id) {
            console.error('User is not logged in or session data is missing');
            return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'User not logged in' });
        }

        const userId = req.session.user._id;
        const { productId } = req.body;



        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
        }

        const isProductExist = wishlist.products.some(item => item.productId.toString() === productId);
        if (!isProductExist) {
            wishlist.products.push({ productId, addedOn: Date.now() });
            await wishlist.save();
        }

        

        res.status(StatusCodes.SUCCESS).json({ success: true, wishlist });
    } catch (error) {
        console.error('Error adding to wishlist:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal server error' });
    }
};
// Controller for removing an item from the wishlist
const removeFromWishlist = async (req, res) => {

    try {

        const userId = req.session.user._id;
        const { productId } = req.body;

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Wishlist not found' });
        }

        wishlist.products = wishlist.products.filter(item => item.productId.toString() !== productId);
        await wishlist.save();

        res.status(StatusCodes.SUCCESS).json({ success: true, wishlist });

    } catch (error) {

        console.error('Error removing item from wishlist:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal server error' });

    }

}

module.exports = {
    loadWishlist,
    addToWishlist,
    removeFromWishlist
}