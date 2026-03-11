const bcrypt = require("bcrypt");
const pool = require("../../config/db");
const axios = require('axios');
require("dotenv").config();

exports.register_roles = async (req,res) => {
     try {
        const [roles] = await pool.query(
            `SELECT * FROM roles`
        );

        res.render("auth/register", {roles, error:null, key: process.env.SITE_SECRET});

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
}
exports.register = async (req, res) => {
  const roleId = parseInt(req.body.role_id, 10);
  const { username, email, password, 'g-recaptcha-response': captcha } = req.body;

  try {

    // Check if email exists
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      const [roles] = await pool.query("SELECT * FROM roles");
      return res.render("auth/register", {roles, error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await pool.query(
      "INSERT INTO users (username, email, password, status) VALUES (?, ?, ?, 'inactive')",
      [username, email, hashedPassword]
    );
    const userId = result.insertId;

    // 4️⃣ Automatically create role approval request
    await pool.query(
        "INSERT INTO role_approvals (user_id, requested_role_id, requested_by) VALUES (?, ?, ?)",
        [userId, roleId, userId] // requested_by = self
    );

    res.redirect("/auth/login");

  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const [users] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.render("auth/login", { error: "Invalid credentials" });
    }

    const user = users[0];

    // Check account status
    if (user.status !== "active") {
      return res.render("auth/login", { error: "Account not approved yet" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.render("auth/login", { error: "Invalid credentials" });
    }

    // Create session
    req.session.user = {
      id: user.id,
      customer_id: user.customer_id,
      vendor_id: user.vendor_id,
      full_name: user.username,
      email: user.email,
      role_id: user.role_id
    };
    req.session.save(() => {
    // 1️⃣ Customer portal
    if (user.customer_id) {
        return res.redirect("/customer/portal");
    }

    // 2️⃣ Vendor portal
    if (user.vendor_id) {
        return res.redirect("/vendor/dashboard");
    }

    switch (user.role_id) {
        case 1: // Admin
            return res.redirect("/admin/approvals");

        case 2: // Accounts
            return res.redirect("/accounts/summary");

        case 3: // Procurement
            return res.redirect("/procure/dashboard");

        case 4: // HR
            return res.redirect("/hr/dashboard");

        default:
            return res.redirect("/dashboard");
    }
});

  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/auth/login");
  });
};

exports.approveRole = async (req, res) => {
    const { approvalId } = req.params;
    console.log(typeof approvalId);
    const ceoId = req.session.user.id;

    try {
        // Get request
        const [rows] = await pool.query(
            "SELECT user_id, requested_role_id FROM role_approvals WHERE id = ? AND status = 'pending'",
            [approvalId]
        );

        if (rows.length === 0) return res.status(404).send("Approval not found");

        const { user_id, requested_role_id } = rows[0];

        // Update approval table
        await pool.query(
            "UPDATE role_approvals SET status='approved' WHERE id=?",
            [approvalId]
        );

        // Update users table
        await pool.query(
            "UPDATE users SET role_id=?, status='active' WHERE id=?",
            [requested_role_id, user_id]
        );

        res.redirect("/admin/approvals");

    } catch (err) {
        console.error(err);
        res.status(500).send("Error approving role");
    }
};

exports.getPendingApprovals = async (req, res) => {
    try {
        const [approvals] = await pool.query(
            `SELECT ra.id, u.username, u.email, r.name AS requested_role
             FROM role_approvals ra
             JOIN users u ON u.id = ra.user_id
             JOIN roles r ON r.id = ra.requested_role_id
             WHERE ra.status = 'inactive' or ra.status = 'pending'`
        );

        res.render("ceo/approvals", { approvals });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
};

 

exports.addCustomer = async (req, res) => {
    const conn = await pool.getConnection();

    try {
        const { name, email,  password, phone, address, description } = req.body;

        const hashedPassword = await bcrypt.hash(password, 12);

        await conn.beginTransaction();

        // 1️⃣ Insert Customer
        const [customerResult] = await conn.execute(
            `INSERT INTO customers (name, password, phone, address, description)
             VALUES (?, ?, ?, ?, ?)`,
            [name, hashedPassword, phone, address, description]
        );

        const customerId = customerResult.insertId;

        // 2️⃣ Auto-create Account for Customer
        const accountName = `${name}`;
        const [accountResult] = await conn.execute(
            `INSERT INTO accounts (name, type)
             VALUES (?, ?)`,
            [accountName, 'asset']
        );

        const accountId = accountResult.insertId;

        // 3️⃣ Link Account to Customer
        await conn.execute(
            `UPDATE customers SET account_id=? WHERE id=?`,
            [accountId, customerId]
        );

        // 4️⃣ Create User Login for Customer
        await conn.execute(
            `INSERT INTO users (username, password, email, role_id, customer_id, status)
             VALUES (?, ?, ?, 6, ?, 'active')`,
            [name, hashedPassword, email, customerId]
        );

        await conn.commit();

        res.redirect('/auth/addCustomer?success=Customer added successfully');

    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.redirect('/auth/addCustomer?error=Unable to add customer');
    } finally {
        conn.release();
    }
};


exports.listCustomers = async (req, res) => {
    try {

        const [customers] = await pool.execute(
            'SELECT id, name, phone, address, description FROM customers ORDER BY id DESC'
        );

        res.render('auth/customersList', {
            customers,
            success: req.query.success,
            error: req.query.error
        });

    } catch (err) {

        console.error(err);
        res.status(500).send('Server Error');

    }
};

// Show Edit Form
exports.showEditCustomer = async (req, res) => {
    try {

        const { id } = req.params;

        const [customers] = await pool.execute(
            'SELECT * FROM customers WHERE id = ?',
            [id]
        );

        if (customers.length === 0) {
            return res.redirect('/auth/customers?error=Customer not found');
        }

        res.render('auth/edit', {
            customer: customers[0]
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};


// Update Customer
exports.updateCustomer = async (req, res) => {
    try {

        const { id } = req.params;
        const { name, phone, address, description } = req.body;

        await pool.execute(
            `UPDATE customers 
             SET name = ?, phone = ?, address = ?, description = ?
             WHERE id = ?`,
            [name, phone, address, description, id]
        );

        res.redirect('/auth/customers?success=Customer updated successfully');

    } catch (err) {
        console.error(err);
        res.redirect('/auth/customers?error=Error updating customer');
    }
};


// Delete Customer
exports.deleteCustomer = async (req, res) => {
    try {

        const { id } = req.params;

        await pool.execute(
            'DELETE FROM customers WHERE id = ?',
            [id]
        );

        res.redirect('/auth/customers?success=Customer deleted successfully');

    } catch (err) {
        console.error(err);
        res.redirect('/auth/customers?error=Error deleting customer');
    }
};



exports.listUsers = async (req, res) => {
    try {

        const [customers] = await pool.execute(`
            SELECT u.id,u.username,u.email, r.name as role_name
            FROM users as u
            LEFT JOIN roles r ON r.id = u.role_id
            ORDER BY u.id DESC
        `);

        res.render('auth/list', {
            customers,
            success: req.query.success,
            error: req.query.error
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};