const express=require("express");
const app=express();
const session = require("express-session")
const passport=require("./config/passport")
const mongoStore = require('connect-mongo')
const path=require("path");
const env=require("dotenv").config();
const db=require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const setCartCount = require('./Middleware/cartcount');
db();

app.use(session({
    secret: process.env.SESSION_SECRET || 'cyberSecret',
    resave: false,  
    saveUninitialized: true,  
    cookie: {
        maxAge: 72*60*60*1000,
        secure: false,  
        httpOnly: true
    },
    store: mongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 72*60*60,  
        autoRemove: 'native'  
    })
}));
app.use(express.json());
app.use(express.urlencoded({extended:true}));


app.set("view engine","ejs");
app.set('views', path.join(__dirname, 'views'));
app.use (express.static(path.join(__dirname,"public")));

app.use("/",userRouter);



app.use((req,res,next)=>{
    res.set('cache-control','no-store');
    next()
})  

app.use(passport.initialize());
app.use(passport.session());


app.use('/admin',adminRouter)


app.listen(PORT=process.env.PORT,()=>{
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin Server is running at http://localhost:${PORT}/admin/dashboard`);
})



app.use(setCartCount);  



module.exports =app;