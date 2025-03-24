const User = require('../../Models/userModel');
const StatusCodes = require('../../util/statusCodes');

const loadUsers = async (req, res) => {
    try {
        let search = req.query.search || ""; 
        let page = parseInt(req.query.page) || 1;
        let status = req.query.status || ""; 
        const limit = 5;

        
        let matchedUser = null;
        if (search) {
            matchedUser = await User.findOne({
                isAdmin: false,
                name: { $regex: '.*' + search + '.*', $options: 'i' },
            });
        }

        
        const filter = {
            isAdmin: false,
            $or: [
                { name: { $regex: '.*' + search + '.*', $options: 'i' } },
                { email: { $regex: '.*' + search + '.*', $options: 'i' } },
            ],
        };

       
        if (status === "active") {
            filter.isBlocked = false;
        } else if (status === "blocked") {
            filter.isBlocked = true;
        }

        
        if (matchedUser) {
            filter._id = { $ne: matchedUser._id };
        }

        const users = await User.find(filter)
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await User.countDocuments(filter);
        const totalPages = Math.ceil(count / limit);

       
        if (matchedUser) {
            users.unshift(matchedUser);
        }

        res.render('admin/users', {
            currentPage: 'users',
            data: users,
            totalPages: totalPages,
            page: page,
            search: search,
            status: status, 
            layout: 'layouts/admin/layout',
        });

    } catch (error) {
        console.error('Error in loadUsers:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin/error', { error: 'Internal Server Error' });
    }
};



const blockCustomer = async (req, res) => {
    try {
        const userId = req.query.id;
        
        await User.updateOne({_id:userId},{$set:{isBlocked:true}})
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error in blockCustomer:', error);
        res.redirect('/pageError');
    }
};

const unBlockCustomer = async (req, res) => {
    try {
        const userId = req.query.id;
        await User.updateOne({_id:userId},{$set:{isBlocked:false}})
        
        res.redirect('/admin/users');
    } catch (error) {
        console.error('Error in unBlockCustomer:', error);
        res.redirect('/pageError');
    }
};

const deleteCustomer = async (req, res) => {
    try {
        const userId = req.query.id;

        if (!userId) {
            return res.status(StatusCodes.BAD_REQUEST).render('admin/error', { error: 'Invalid User ID' });
        }

        await User.deleteOne({ _id: userId }); 
        res.redirect('/admin/users'); 
    } catch (error) {
        console.error('Error in deleteCustomer:', error);
        res.redirect('/pageError');
    }
};

module.exports = {
    loadUsers,
    blockCustomer,
    unBlockCustomer,
    deleteCustomer
};