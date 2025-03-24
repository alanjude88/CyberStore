const Brand = require('../../Models/brandModel');
const Product = require('../../Models/productModel');
const StatusCodes = require('../../util/statusCodes');

const loadBrands = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const brandData = await Brand.find({ isDeleted: false })
                                    .sort({ createdAt: -1 })
                                    .skip(skip)
                                    .limit(limit);
        const mappedBrandData = brandData.map((brand) => ({
            _id: brand._id,
            brandName: brand.brandName,
            image: brand.image,
        }));
        const totalBrands = await Brand.countDocuments({ isDeleted: false });
        const totalPages = Math.ceil(totalBrands / limit);
        
        res.render('admin/brands', {
            data: mappedBrandData,
            currentPage: page,
            totalPages: totalPages,
            totalBrands: totalBrands
        });
    } catch (error) {
        console.log(error);
        res.redirect('/pageError');
    }
}

const addNewBrand = async (req, res) => {
    try {
        

        if (!req.file) {
            return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Brand image not found, Please upload an image' });
        }
        const { brandName } = req.body;
        const image = req.file ? req.file.filename : null;
        
        if (!brandName || !image) {
            return res.status(StatusCodes.BAD_REQUEST).json({ error: 'All fields are required' });
        }

        const findBrand = await Brand.findOne({ brandName });
        if (findBrand) {
            return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Brand already exists in the database' });
        }

        const newBrand = new Brand({ brandName, image });
        await newBrand.save();

        res.redirect('/admin/brands');
    } catch (error) {
        console.log('Error occurred while adding new brand', error);
        res.redirect('/pageError');
    }
}

const blockBrand = async (req, res) => {
    try {
        const brandId = req.query.id;
        await Brand.findByIdAndUpdate(brandId, { isBlocked: true });
        res.json({ success: true });
    } catch (error) {
        console.error("Error occurred while blocking brand:", error);
        res.json({ success: false });
    }
};

const unBlockBrand = async (req, res) => {
    try {
        const brandId = req.query.id;
        await Brand.findByIdAndUpdate(brandId, { isBlocked: false });
        res.json({ success: true });
    } catch (error) {
        console.error("Error occurred while unblocking brand:", error);
        res.json({ success: false });
    }
};

const deleteBrand = async (req, res) => {
    try {
        const brandId = req.query.id;
        
        if (!brandId) {
            console.log('Invalid or missing ID');
            return res.redirect('/pageError');
        }
        await Brand.findByIdAndUpdate(brandId, { isDeleted: true });
        console.log(`Brand with ID: ${brandId} has been soft deleted successfully`);
        
        res.redirect('/admin/brands');
    } catch (error) {
        console.log('Error while deleting brand', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).redirect('/pageError');
    }
}

const restoreBrand = async (req, res) => {
    try {
        const brandId = req.query.id;
        if (!brandId) {
            console.log('Invalid or missing ID');
            return res.redirect('/pageError');
        }
        await Brand.findByIdAndUpdate(brandId, { isDeleted: false });
        console.log(`Brand with ID: ${brandId} has been restored successfully`);
        
        res.redirect('/admin/brands');
    } catch (error) {
        console.log('Error while restoring brand', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).redirect('/pageError');
    }
}

module.exports = {
    loadBrands,
    addNewBrand,
    blockBrand,
    unBlockBrand,
    deleteBrand,
    restoreBrand,
}












