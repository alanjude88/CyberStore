const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid"); // ✅ Import uuidv4 properly
const { Schema } = mongoose;

const walletSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Types.ObjectId,
            ref: "User",
            required: true,
        },
        balance: {
            type: Number,
            default: 0,
        },
        walletHistory: [
            {
                transactionId: { type: String, default: () => uuidv4() }, // ✅ Corrected usage
                transactionType: {
                    type: String,
                    enum: ["credit", "debit"],
                    required: true,
                },
                amount: {
                    type: Number,
                    required: true,
                },
                date: {
                    type: Date,
                    default: Date.now,
                },
                description: {
                    type: String,
                    enum: ["Refund", "Add to Wallet", "Purchase", "Initial balance", "Cancelled"],
                },
            },
        ],
    },
    { timestamps: true }
);

walletSchema.index({ userId: 1 });
walletSchema.index({ "walletHistory.transactionId": 1 });

// walletSchema.index({ userId: 1, 'walletHistory.transactionId': 1 }, { unique: true });

const Wallet = mongoose.model("Wallet", walletSchema);
module.exports = Wallet;
