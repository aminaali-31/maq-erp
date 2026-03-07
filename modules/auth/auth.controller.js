const bcrypt = require("bcrypt");
const pool = require("../../config/db");


exports.register_roles = async (req,res) => {
     try {
        const [roles] = await pool.query(
            `SELECT * FROM roles`
        );

        res.render("auth/register", {roles, error:null});

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
}
exports.register = async (req, res) => {
  const roleId = parseInt(req.body.role_id, 10);
  const { username, email, password} = req.body;

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
      full_name: user.username,
      email: user.email,
      role_id: user.role_id
    };

    res.redirect("/admin/approvals");

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

exports.addCutomer = async (req,res) => {
  const  {name , phone , address , description} = req.body;

  if ( !name || !phone )
  {
    res.redirect('/auth/addCustomer', {message: 'Name and phone cannot be empty'});
  }
  try {
    const [result] = await pool.query(`INSERT INTO customers (name,phone,address,description)
      VALUES (?,?,?,?)`, [name,phone,address,description]);

    res.redirect('/auth/addCustomer?success=Cusomter added successfully');

  } catch (e)
  {
    res.redirect('/auth/addCustomer?error=Unable to add cusomter');
  }
}


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