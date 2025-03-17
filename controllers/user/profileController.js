const User = require('../../Models/userModel');
const Address = require('../../Models/addressModel');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();
const session = require('express-session');


function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        console.log('Starting email verification process...');
        console.log('Email configuration:', {
            user: process.env.NODEMAILER_EMAIL,
            pass: process.env.NODEMAILER_PASSWORD ? '****' : 'not set'
        });

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            },
        });

        await transporter.verify();
        console.log('Transporter verified successfully');

        console.log('Sending email to:', email);
        console.log('OTP:', otp);

        const info = await transporter.sendMail({
            from: `"CyberCrate" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: 'CyberCrate - Verify Your Email',
            text: `Your OTP is ${otp}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Email Verification</h2>
                    <p>Your verification code is:</p>
                    <h1 style="color: #6c63ff; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                    <p>This code will expire in 5 minutes.</p>
                    <p>If you didn't request this code, please ignore this email.</p>
                </div>
            `
        });

        console.log('Email sent successfully:', {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected
        });

        return info.accepted.length > 0;
    } catch (error) {
        console.error('Detailed email error:', {
            name: error.name,
            message: error.message,
            code: error.code,
            command: error.command,
            response: error.response
        });
        return false;
    }
}

const forgotPassword = async (req, res) => {
    try {
        res.render('users/forgotPassword');
    } catch (error) {
        res.redirect('/404-error');
    }
};

const forgotEmailValidation = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (user) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);

            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                req.session.otpExpiry = Date.now() + 5 * 60 * 1000; 
                res.json({ success: true, message: 'OTP sent to your email.' });
                console.log('-------------------------------------OTP is:', otp);
            } else {
                res.json({ success: false, message: 'Failed to send OTP. Please try again later.' });
            }
        } else {
            res.json({ success: false, message: 'User not found with the given email' });
        }
    } catch (error) {
        console.log('Error in forgot email validation', error);
        res.status(500).json({ success: false, message: 'Internal Server Error. Please try again later.' });
    }
};

const forgotPasswordOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        if (!req.session.userOtp || !req.session.email || !req.session.otpExpiry) {
            return res.status(400).json({
                success: false,
                message: 'Session expired. Please try again.'
            });
        }

        const now = Date.now();
        const expiryTime = req.session.otpExpiry;
        if (now > expiryTime) {
            delete req.session.userOtp;
            delete req.session.email;
            delete req.session.otpExpiry;
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please try again.'
            });
        }

        const receivedOtp = String(otp).trim();
        const storedOtp = String(req.session.userOtp).trim();
        if (receivedOtp !== storedOtp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP. Please try again.'
            });
        }

        delete req.session.userOtp;
        delete req.session.otpExpiry;

        return res.json({
            success: true,
            message: 'OTP verified successfully!',
            redirectUrl: '/users/resetPassword'
        });
    } catch (error) {
        console.error('OTP verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred during verification'
        });
    }
};

const renderOtpPage = async (req, res) => {
    try {
        res.render('users/forgotPasswordOtp');
    } catch (error) {
        res.redirect('/404-error');
    }
};

const resetPassword = async (req, res) => {
    try {
        if (!req.session.email) {
            return res.redirect('/users/forgotPassword'); 
        }
        res.render('users/resetPassword');

        // const { email } = req.body;

        // req.session.email = email;

        // res.render('users/resetPassword');
    } catch (error) {
        console.error('Error in resetPassword:', error);
        res.redirect('/404-error');
    }
};

const resetPasswordValidation = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match' });
        }

        const email = req.session.email;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Session expired or invalid' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();

        delete req.session.email;
        delete req.session.userOtp;
        delete req.session.otpExpiry;

        return res.json({ success: true, message: 'Password reset successfully', redirectUrl: '/auth' });

    } catch (error) {
        console.error('Reset password error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error. Please try again later.' });
    }
};

const loadProfile = async (req, res) => {
    try {

        if (!req.session.user) {
            return res.redirect('/auth');
        }

        if (req.session.user.email) {
            return res.render('users/userProfile', { user: req.session.user });
        }

        const userData = await User.findById(req.session.user).populate('addresses');
        if (!userData) {
            return res.redirect('/auth');
        }

        res.render('users/userProfile', { user: userData });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.redirect('/');
    }
};

const editProfile = async (req, res) => {
    try {
        const userData = await User.findById(req.session.user);
        res.render('users/editProfile', { user: userData });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.redirect('/');
    }
};

const updateProfile = async(req,res)=>{
    try {
        
        const userId = req.session.user;
        const {fullName,phone} = req.body;
        const user =await User.findById(userId);

        if(!user){
            return res.status(404).json({ error: 'User not found',success: false });
        }
        user.name = fullName;
        user.phone=phone;
        await user.save();

        res.json({ success: true,message: 'Profile updated successfully',redirectUrl:'/profile'});

    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, message: 'Internal server error. Please try again later.' });
    }
}

const loadAddresses = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressData = await Address.findOne({ userId });
        const addresses = addressData ? addressData.address : [];
        res.render('users/addresses', { userId, addresses });
    } catch (error) {
        console.error('Error loading addresses:', error);
        res.redirect('/404-error');
    }
};

const loadAddAddress = async (req, res) => {
    try {
        const returnTo = req.query.returnTo || null;  // Capture returnTo from query params
        res.render('users/addAddress', { returnTo });  // Pass it to the view
    } catch (error) {
        console.error('Error loading add address page:', error);
        res.redirect('/404-error');
    }
};

const addAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const newAddress = req.body;

        let addressData = await Address.findOne({ userId });
        if (!addressData) {
            addressData = new Address({ userId, address: [] });
        }
        addressData.address.push(newAddress);
        await addressData.save();

        await User.findByIdAndUpdate(userId, {
            $push: { addresses: addressData._id }
        });

        const returnTo = req.query.returnTo || '/profile/addresses';
        res.redirect(returnTo);  // Redirects to /checkout if provided, else to /profile/addresses
    } catch (error) {
        console.error('Error adding address:', error);
        res.redirect('/404-error');
    }
};

const loadEditAddressPage = async (req, res) => {
    try {
        const addressId = req.params.id;
        const addressData = await Address.findOne({ 'address._id': addressId });
        if (!addressData) {
            return res.status(404).json({ error: 'Address not found' });
        }
        const address = addressData.address.find(address => address._id.toString() === addressId);
        if (!address) {
            return res.status(404).json({ error: 'Address not found' });
        }
        res.render('users/editAddress', { address });
    } catch (error) {
        console.error('Error loading edit address page:', error);
        res.redirect('/404-error');
    }
};

const editAddress = async (req, res) => {
    try {
        const { id, addressType, name, city, landMark, district, state, pincode, phone, alterPhone } = req.body;

        await Address.updateOne(
            { 'address._id': id },
            {
                $set: {
                    'address.$.addressType': addressType,
                    'address.$.name': name,
                    'address.$.city': city,
                    'address.$.landMark': landMark,
                    'address.$.district': district,
                    'address.$.state': state,
                    'address.$.pincode': pincode,
                    'address.$.phone': phone,
                    'address.$.alterPhone': alterPhone
                }
            }
        );

        res.redirect('/profile/addresses');
    } catch (error) {
        console.error('Error editing address:', error);
        res.redirect('/404-error');
    }
};

const deleteAddress = async (req, res) => {
    try {
        const { id } = req.body;
        const userId = req.session.user;

        const addressData = await Address.findOneAndUpdate(
            { userId },
            { $pull: { address: { _id: id } } },
            { new: true }
        );

        if (!addressData) {
            return res.status(404).json({ error: 'Address not found' });
        }

        await User.findByIdAndUpdate(userId, {
            $pull: {
                addresses: id
            }
        })

        console.log(`Address with ID: ${id} has been deleted successfully`);
        res.redirect('/profile/addresses');
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).redirect('/404-error');
    }
};

const changePassword = async (req, res) => {
    try {
        const user = await User.findById(req.session.user);

        if (!user) {
            return res.status(400).send("User not found.");
        }

        res.render("users/changePassword", { user });
    } catch (error) {
        console.error("Error loading change password page:", error);
        res.status(500).send("Internal server error.");
    }
};


const changePasswordValidation = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const user = await User.findById(req.session.user);
        if (!user) {
            return res.status(400).json({ success: false, message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        return res.json({ success: true, message: 'Password changed successfully', redirectUrl: '/profile' });
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error. Please try again later.' });
    }
};



const getAddresses = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log('User ID:', userId);

        const addressData = await Address.findOne({ userId });
        const addresses = addressData ? addressData.address : [];

        res.render('users/selectAddress', { userId, addresses });
    } catch (error) {
        console.error('Error loading addresses:', error);
        res.status(500).send({ message: 'Error loading addresses' });
    }
};


const setDefaultAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const addressId = req.params.id;

        await User.findByIdAndUpdate(userId, { defaultAddressId: addressId });

        console.log(`Default address set for user: ${userId} to address: ${addressId}`);
        res.redirect('/checkout');
    } catch (error) {
        console.error('Error setting default address:', error);
        res.status(500).send({ message: 'Error setting default address' });
    }
};



module.exports = {
    forgotPassword,
    forgotEmailValidation,
    forgotPasswordOtp,
    renderOtpPage,
    resetPassword,
    resetPasswordValidation,
    loadProfile,
    editProfile,
    updateProfile,
    loadAddAddress,
    loadAddresses,
    addAddress,
    loadEditAddressPage,
    editAddress,
    deleteAddress,
    getAddresses,
    setDefaultAddress,
    changePassword,
    changePasswordValidation
};

