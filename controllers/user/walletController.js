const Order = require('../../Models/orderModel');
const Wallet = require('../../Models/walletModel');
const User = require('../../Models/userModel');
const { v4: uuidv4 } = require('uuid');

//function to load wallet


const getWalletPage = async (req, res) => {
    try {
        
        // const userId = req.session.user._id;
        const userId = req.session.user;
        let wallet = await Wallet.findOne({ userId });

        if (!wallet) {
            wallet = new Wallet({
                userId,
                balance: 0,
                walletHistory: [{
                    transactionId: uuidv4(), 
                    transactionType: 'credit',
                    amount: 0,
                    description: 'Add to Wallet' 
                }]
            });

            console.log('New wallet:', wallet);
            
            await wallet.save();
        }

        res.render('users/wallet', { wallet,user:userId });
    } catch (error) {
        console.error('Error loading wallet page:', error);
        res.status(500).send({ message: 'Error loading wallet page' });
    }
};


//function to add money
const addMoneyToWallet = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.session.user._id;

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0 });
        }

        let transaction = {
            transactionId: uuidv4(), 
            transactionType: 'credit',
            amount: Number(amount),
            date: new Date(),
            description: 'Add to Wallet'
        };
        console.log('Transaction:', transaction);
        

        wallet.balance += Number(amount);
        wallet.walletHistory.push(transaction);

        console.log('Wallet-------------:', wallet);
        
        await wallet.save();
        res.status(200).json({ success: true, balance: wallet.balance });
    } catch (error) {
        console.error('Error adding money to wallet:', error);
        res.status(500).json({ success: false, message: 'Error adding money' });
    }
};


//function to get balance
const getWalletBalance = async (userId) => {
    const wallet = await Wallet.findOne({ userId });
    return wallet ? wallet.balance : 0;
};


//function to check balance
const checkWalletBalance = async (userId, amount) => {
    const wallet = await Wallet.findOne({ userId });
    return wallet && wallet.balance >= amount;
};


//function to make payment
const walletPayment = async (userId, amount, description) => {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet || wallet.balance < amount) {
        throw new Error('Insufficient wallet balance');
    }

    wallet.balance -= amount;
    wallet.walletHistory.push({
        transactionId: uuidv4(), 
        transactionType: 'debit',
        amount: amount,
        description: description
    });

    await wallet.save();
    return wallet;
};
//function to make refund
const walletRefund = async (userId, amount, description) => {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
        wallet = new Wallet({ userId, balance: 0 });
    }

    wallet.balance += amount;
    wallet.walletHistory.push({
        transactionId: uuidv4(), 
        transactionType: 'credit',
        amount: amount,
        description: description
    });

    await wallet.save();
    return wallet;
};


module.exports = {
    getWalletPage,
    addMoneyToWallet,
    walletPayment,
    walletRefund,
    checkWalletBalance,
    getWalletBalance
};