const category = require('../../Models/categoryModel');
const Product = require('../../Models/productModel');
const user = require('../../Models/userModel');
const order = require('../../Models/orderModel');
const banner = require('../../Models/bannerModel');

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
        // Trim and convert name to lowercase for uniformity
        name = name.trim();

        // Case-insensitive check for existing category
        const categoryExist = await category.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });

        if (categoryExist) {
            return res.status(400).json({ error: 'Category Already Exists' });
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
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const editCategory = async(req,res)=>{
    try {
        
    const id=req.query.id;
    const categoryData=await category.findOne({_id:id})
    res.render('admin/editCategory',{category:categoryData});    

    } catch (error) {
        
        console.log('error while editing the categories',error);
        
        res.redirect('/pageError')
        
    }
}

const updateCategory = async (req, res) => {
    try {
        const id = req.body.categoryId;
        let { name, description, categoryOffer } = req.body;

        // Trim input name to remove spaces and ensure uniformity
        name = name.trim();

        // Check for an existing category with the same name (case-insensitive) excluding the current category
        const existingCategory = await category.findOne({
            name: { $regex: `^${name}$`, $options: 'i' }, // Case-insensitive regex search
            _id: { $ne: id } // Exclude the current category
        });

        if (existingCategory) {
            return res.status(400).json({ error: 'Category Already Exists, write another One' });
        }

        // Update the category
        const updatedCategory = await category.findByIdAndUpdate(id, {
            name,
            description,
            categoryOffer: categoryOffer || 0
        }, { new: true });

        if (!updatedCategory) {
            return res.status(404).json({ error: 'Category Not Found' });
        }

        // Update product sale prices based on category and product offers
        const products = await Product.find({ category: id });
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
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};



const listCategories = async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: "Category ID is required" });
        }

        const existingCategory = await category.findById(id);
        if (!existingCategory) {
            return res.status(404).json({ error: "Category not found" });
        }

        await category.updateOne({ _id: id }, { $set: { isListed: false } });

        return res.redirect('/admin/categories');
    } catch (error) {
        console.error("Error listing category:", error);
        return res.redirect('/pageError');
    }
};

const unListCategories = async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: "Category ID is required" });
        }

        const existingCategory = await category.findById(id);
        if (!existingCategory) {
            return res.status(404).json({ error: "Category not found" });
        }

        await category.updateOne({ _id: id }, { $set: { isListed: true } });

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