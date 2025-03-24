const express = require('express');
const router = express.Router();
const {isAdminAuthenticated} = require('../Middleware/adminAuth')
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController=require('../controllers/admin/categoryController')
const brandController=require('../controllers/admin/brandController')
const productController=require('../controllers/admin/productController')
const bannerController=require('../controllers/admin/bannerController')
const adminOrderController=require('../controllers/admin/adminOrderController')
const couponController=require('../controllers/admin/couponController')

const upload = require('../Helpers/multer');


// admin authentication routes
router.get('/pageError',adminController.pageError)
router.get('/login', adminController.loadAdminLogin);
router.post('/login', adminController.verifyLogin);
router.get('/logout',adminController.logout)

//dashboard management
router.get("/dashboard", isAdminAuthenticated, adminController.loadDashboard)
router.get(
  "/dashboard/filter",
  isAdminAuthenticated,
  adminController.filteredAdminDashboard
);
// userManagement Routes
router.get('/users', isAdminAuthenticated, customerController.loadUsers);
router.get('/blockCustomer', isAdminAuthenticated, customerController.blockCustomer);
router.get('/unBlockCustomer', isAdminAuthenticated, customerController.unBlockCustomer);


// categoryManagemanet routes
router.get('/categories',isAdminAuthenticated,categoryController.loadCategories);
router.post('/categories',isAdminAuthenticated,categoryController.addNewCategories)
router.get('/listCategories',isAdminAuthenticated,categoryController.listCategories);
router.get('/unListCategories',isAdminAuthenticated,categoryController.unListCategories);
router.get('/editCategory',isAdminAuthenticated,categoryController.editCategory);
router.post('/editCategory',isAdminAuthenticated,categoryController.updateCategory);

// brandManagemanet routes
router.get('/brands',isAdminAuthenticated,brandController.loadBrands);
router.post('/brands',isAdminAuthenticated,upload.single('image'),brandController.addNewBrand);
router.get('/blockBrand',isAdminAuthenticated,brandController.blockBrand);
router.get('/unBlockBrand',isAdminAuthenticated,brandController.unBlockBrand);
router.get('/deleteBrand',isAdminAuthenticated,brandController.deleteBrand);
router.get('/restoreBrand', isAdminAuthenticated, brandController.restoreBrand); 


//productManagement routes
router.get("/products", isAdminAuthenticated, productController.loadProducts);
router.get(
  "/addProducts",
  isAdminAuthenticated,
  productController.loadAddProduct
);
router.post(
  "/products",
  isAdminAuthenticated,
  upload.array("images", 5),
  productController.addNewProduct
);
router.patch(
  "/blockProduct/:id",
  isAdminAuthenticated,
  productController.blockProduct
);
router.patch(
  "/unBlockProduct/:id",
  isAdminAuthenticated,
  productController.unBlockProduct
);
router.get(
  "/editProduct/:id",
  isAdminAuthenticated,
  productController.loadEditProduct
);
router.post(
  "/editProduct/:id",
  isAdminAuthenticated,
  upload.array("images", 5),
  productController.editProduct
);
router.post(
  "/deleteImage",
  isAdminAuthenticated,
  productController.deleteSingleImage
);
router.post(
  "/deleteOffer/:productId",
  isAdminAuthenticated,
  productController.deleteOffer
);

//bannerManagement routes
router.get('/banners', isAdminAuthenticated, bannerController.loadBanners);
router.post('/banners', isAdminAuthenticated, upload.single('image'), bannerController.addNewBanner);


//orderManagement routes
router.get('/orderList', isAdminAuthenticated, adminOrderController.getAllOrders);
router.post('/orderList/updateStatus', isAdminAuthenticated, adminOrderController.updateStatus);
router.get(
    "/orderList/viewOrder/:id",
    isAdminAuthenticated,
    adminOrderController.viewOrder
  );

//couponManagement routes
router.get('/coupons',isAdminAuthenticated, couponController.loadCoupons);
router.get('/coupons/add',isAdminAuthenticated,couponController.loadAddCoupon);
router.post('/coupons',isAdminAuthenticated,couponController.createCoupon);
router.get('/coupons/edit/:couponID',isAdminAuthenticated,couponController.loadUpdateCoupon);
router.post('/coupons/edit/:couponID',isAdminAuthenticated,couponController.updateCoupon);
router.get('/deleteCoupon',isAdminAuthenticated,couponController.deleteCoupon);

//salesManagement routes


router.get("/salesPage", isAdminAuthenticated, adminController.loadSalesPage);
router.get(
  "/filter-sales",
  isAdminAuthenticated,
  adminController.filterSalesReport
);
router.get(
  "/download-excel",
  isAdminAuthenticated,
  adminController.excelReportDownload
);
router.get(
  "/download-pdf",
  isAdminAuthenticated,
  adminController.downloadPDFreport
);

module.exports = router;
