const session = require("express-session");
const path = require('path');
const express = require('express');
const MySQLStore = require("express-mysql-session")(session);
const pool = require("./config/db");
const sessionStore = new MySQLStore({}, pool);
const authRoutes = require("./routes/auth.routes");
const ceoRoutes = require("./routes/ceo.routes");
const inventoryRoutes = require('./routes/inventory');
const procureRoutes = require('./routes/procure.routes')
const salesRoutes = require('./routes/sales');
const paymentRoutes = require('./routes/payments')
const accountRoutes = require('./routes/accounts');
const hrRoutes = require('./routes/hr.routes');
const customerRoutes = require('./routes/customer');
const vendorRoutes = require('./routes/vendor');
const quotationController = require('./modules/sales/quotations')


const app = express();
// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, "public")));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  session({
    key: "erp_session",
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 2
    }
  })
);

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

app.get('/', async (req, res) => {

    const quotes = await quotationController.publishedQuotations();

    res.render('quotations/dashboard', {
        quotes
    });

});
app.use("/auth", authRoutes);
app.use("/admin", ceoRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/procure', procureRoutes);
app.use('/sales', salesRoutes);
app.use('/payments', paymentRoutes);
app.use('/accounts', accountRoutes);
app.use('/customer', customerRoutes);
app.use('/vendor', vendorRoutes)
app.use('/hr', hrRoutes);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});