const express = require("express");
const router = express.Router();
const { register_roles,register, login, logout, addCutomer,listCustomers,
            deleteCustomer,showEditCustomer,updateCustomer ,listUsers} = require("../modules/auth/auth.controller");

const authenticateAndAuthorize = require('../middlewares/inventory');
// Registration page
router.get("/register",register_roles);
router.post("/register", register);

// Login page
router.get("/login", (req, res) => res.render("auth/login", {error:null}));
router.post("/login", login);

// Logout
router.get("/logout", logout);

router.get('/customers',authenticateAndAuthorize([1,3]),listCustomers);

router.get('/addCustomer', authenticateAndAuthorize([1,3]),(req,res) => res.render('auth/addCustomer',{success: req.query.success, error: req.query.error}));

router.post('/addCustomer',authenticateAndAuthorize([1,3]), addCutomer);

router.get('/customers/edit/:id', authenticateAndAuthorize([1,3]), showEditCustomer);

router.post('/customers/update/:id', authenticateAndAuthorize([1,3]), updateCustomer);

router.get('/customers/delete/:id', authenticateAndAuthorize([1,3]), deleteCustomer);


router.get('/users',authenticateAndAuthorize([1]),listUsers);
module.exports = router;