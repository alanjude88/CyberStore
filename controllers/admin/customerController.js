const User = require('../../Models/userModel');

const loadUsers = async (req, res) => {
    try {
        let search = req.query.search || ""; // Get search query if present
        let page = parseInt(req.query.page) || 1;
        let status = req.query.status || ""; // Get status filter if present
        const limit = 5;

        // Query to find the user matching the search
        let matchedUser = null;
        if (search) {
            matchedUser = await User.findOne({
                isAdmin: false,
                name: { $regex: '.*' + search + '.*', $options: 'i' },
            });
        }

        // Base query for paginated users
        const filter = {
            isAdmin: false,
            $or: [
                { name: { $regex: '.*' + search + '.*', $options: 'i' } },
                { email: { $regex: '.*' + search + '.*', $options: 'i' } },
            ],
        };

        // Apply status filter if provided
        if (status === "active") {
            filter.isBlocked = false;
        } else if (status === "blocked") {
            filter.isBlocked = true;
        }

        // Exclude the matched user's ID from the pagination query
        if (matchedUser) {
            filter._id = { $ne: matchedUser._id };
        }

        const users = await User.find(filter)
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await User.countDocuments(filter);
        const totalPages = Math.ceil(count / limit);

        // Prepend the matched user to the results if found
        if (matchedUser) {
            users.unshift(matchedUser);
        }

        res.render('admin/users', {
            currentPage: 'users',
            data: users,
            totalPages: totalPages,
            page: page,
            search: search,
            status: status, // Pass the selected status to the front-end
            layout: 'layouts/admin/layout',
        });

    } catch (error) {
        console.error('Error in loadUsers:', error);
        res.status(500).render('admin/error', { error: 'Internal Server Error' });
    }
};



const blockCustomer = async (req, res) => {
    try {
        const userId = req.query.id;
        // await User.findByIdAndUpdate(userId, { isBlocked: true });
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
        // await User.findByIdAndUpdate(userId, { isBlocked: false });
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
            return res.status(400).render('admin/error', { error: 'Invalid User ID' });
        }

        await User.deleteOne({ _id: userId }); // Deletes the user from the database
        res.redirect('/admin/users'); // Redirect back to the users page
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