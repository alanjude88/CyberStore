const Product = require('../../Models/productModel');
const Category = require('../../Models/categoryModel');
const User = require('../../Models/userModel');
const Order = require('../../Models/orderModel');
const Cart = require('../../Models/cartModel');
const Brand = require('../../Models/brandModel');
const StatusCodes = require('../../util/statusCodes');




const productDetails = async (req, res) => {
    try {
      const userId = req.session.user;
      const userData = userId ? await User.findById(userId) : null;
      const productId = req.params.id;
  
      
      const product = await Product.findById(productId).populate('category  brand');
      if (!product) {
        return res.status(StatusCodes.NOT_FOUND).render('404-error', { message: 'Product not found' });
      }
      

      const relatedProducts = await Product.find({
        category: product.category,
        _id: { $ne: productId }
      }).limit(3);
  
      res.render('users/productDetails', {
        user: userData,
        product: product,
        category: product.category,
        quantity: product.quantity,
        relatedProducts,
        brandName :product.brand
      });
    } catch (error) {
      console.error('Error fetching product details:', error);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Server error');
    }
  };
  



const searchProducts = async (req, res) => {
  try {
    const searchWord = req.query.searchWord || '';
    

    const result = await Product.find({
      name: { $regex: searchWord, $options: 'i' }
    });

    
    res.render('users/searchProducts', { result, searchWord });
  } catch (error) {
    console.error('Error loading search products:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error', success: false });
  }
};


module.exports = {
    productDetails,
    searchProducts
};