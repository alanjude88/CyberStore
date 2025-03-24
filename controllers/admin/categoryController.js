const category = require('../../Models/categoryModel');
const Product = require('../../Models/productModel');
const user = require('../../Models/userModel');
const order = require('../../Models/orderModel');
const banner = require('../../Models/bannerModel');
const StatusCodes = require('../../util/statusCodes');

const loadCategories = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        
        const categories = await category.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);
        
        res.render('admin/categories', {
            categories: categories,
            currentPage: 'categories',
            page: page,
            totalPages: totalPages,
            limit: limit,
            layout: 'layouts/admin/layout'
        });

    } catch (error) {
        console.log('Error while loading categories:', error);
        res.redirect('/pageError');
    }
}

const addNewCategories = async (req, res) => {
    let { name, description, categoryOffer } = req.body;

    try {
        
        name = name.trim();

       
        const categoryExist = await category.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });

        if (categoryExist) {
            return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Category Already Exists' });
        }

        const newCategory = new category({
            name,
            description,
            categoryOffer: categoryOffer || 0,
        });

        await newCategory.save();

        res.status(201).json({ message: 'Category added successfully!' });
    } catch (error) {
        console.error('Error while adding new category:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
    }
};

const editCategory = async(req,res)=>{
    try {
        
    const categoryId=req.query.id;
    const categoryData=await category.findOne({_id:categoryId})
    res.render('admin/editCategory',{category:categoryData});    

    } catch (error) {
        
        console.log('error while editing the categories',error);
        
        res.redirect('/pageError')
        
    }
}

const updateCategory = async (req, res) => {
    try {
        const categoryId = req.body.categoryId;
        let { name, description, categoryOffer } = req.body;

   
        name = name.trim();
       
       
        const existingCategory = await category.findOne({
            name: { $regex: `^${name}$`, $options: 'i' }, 
            _id: { $ne: categoryId } 
        });

        if (existingCategory) {
            return res.status(400).json({ error: 'Category Already Exists, write another One' });
        }

        
        const updatedCategory = await category.findByIdAndUpdate(categoryId, {
            name,
            description,
            categoryOffer: categoryOffer || 0
        }, { new: true });

        if (!updatedCategory) {
            return res.status(StatusCodes.NOT_FOUND).json({ error: 'Category Not Found' });
        }

        
        const products = await Product.find({ category: categoryId });
        for (let product of products) {
            const categoryOfferValue = parseFloat(categoryOffer) || 0;
            const productOfferValue = parseFloat(product.productOffer) || 0;
            const regularPrice = parseFloat(product.realPrice) || 0;

            const highestOffer = Math.max(categoryOfferValue, productOfferValue);
            const finalSalePrice = regularPrice - (regularPrice * highestOffer / 100);

            product.salePrice = !isNaN(finalSalePrice) ? finalSalePrice : regularPrice;
            await product.save();
        }

        return res.json({ message: 'Category Updated Successfully' });
    } catch (error) {
        console.log('Error while updating category', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
    }
};



const listCategories = async (req, res) => {
    try {
        const { categoryId } = req.query;

        if (!categoryId) {
            return res.status(StatusCodes.BAD_REQUEST).json({ error: "Category ID is required" });
        }

        const existingCategory = await category.findById(categoryId);
        if (!existingCategory) {
            return res.status(StatusCodes.NOT_FOUND).json({ error: "Category not found" });
        }

        await category.updateOne({ _id: categoryId }, { $set: { isListed: false } });

        return res.redirect('/admin/categories');
    } catch (error) {
        console.error("Error listing category:", error);
        return res.redirect('/pageError');
    }
};

const unListCategories = async (req, res) => {
    try {
        const { categoryId } = req.query;

        if (!categoryId) {
            return res.status(StatusCodes.BAD_REQUEST).json({ error: "Category ID is required" });
        }

        const existingCategory = await category.findById(categoryId);
        if (!existingCategory) {
            return res.status(StatusCodes.NOT_FOUND).json({ error: "Category not found" });
        }

        await category.updateOne({ _id: categoryId }, { $set: { isListed: true } });

        return res.redirect('/admin/categories');
    } catch (error) {
        console.error("Error unlisting category:", error);
        return res.redirect('/pageError');
    }
};


module.exports={
    loadCategories ,
    addNewCategories,
    listCategories,
    unListCategories,
    editCategory,
    updateCategory
}