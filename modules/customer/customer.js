const pool = require("../../config/db");


// ===============================
// CUSTOMER DASHBOARD
// ===============================
exports.portal = async (req, res) => {
    try {

        const customerId = req.session.user.customer_id;

        const [orders] = await pool.query(
            "SELECT COUNT(*) AS total FROM sales_orders WHERE customer_id = ?",
            [customerId]
        );

        const [complaints] = await pool.query(
            "SELECT COUNT(*) AS total FROM complaints WHERE customer_id = ?",
            [customerId]
        );

        const [customer] = await pool.query(
            "SELECT name, account_id FROM customers WHERE id = ?",
            [customerId]
        );

        res.render("customer/portal", {
            customer: customer[0],
            orders: orders[0].total,
            complaints: complaints[0].total
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to load customer portal");
    }
};



// ===============================
// CUSTOMER ORDERS
// ===============================
exports.orders = async (req, res) => {

    try {

        const customerId = req.session.user.customer_id;

        const [orders] = await pool.query(
            `SELECT id, date, total_amount, status, feedback
             FROM sales_orders
             WHERE customer_id = ?
             ORDER BY id DESC`,
            [customerId]
        );

        res.render("customer/orders", { orders });

    } catch (error) {

        console.error(error);
        res.status(500).send("Unable to load orders");

    }
};

exports.addOrderFeedback = async (req, res) => {
    try {
        const customerId = req.session.user.customer_id;
        const { rating } = req.body;          // 1-5 stars
        const orderId = req.params.id;        // order ID from URL

        if (!rating || rating < 1 || rating > 5) {
            return res.redirect("/customer/orders?error=Invalid rating");
        }

        // Ensure order belongs to this customer
        const [order] = await pool.query(
            `SELECT id FROM sales_orders WHERE id = ? AND customer_id = ?`,
            [orderId, customerId]
        );

        if (order.length === 0) {
            return res.redirect("/customer/orders?error=Order not found");
        }

        // Update feedback
        await pool.query(
            `UPDATE sales_orders SET feedback = ? WHERE id = ?`,
            [rating, orderId]
        );

        res.redirect("/customer/orders?success=Feedback submitted");

    } catch (error) {
        console.error(error);
        res.redirect("/customer/orders?error=Unable to submit feedback");
    }
};


// ===============================
// CUSTOMER LEDGER
// ===============================
exports.ledger = async (req, res) => {

    try {

        const customerId = req.session.user.customer_id;

        const [customer] = await pool.query(
            "SELECT account_id FROM customers WHERE id = ?",
            [customerId]
        );

        if (customer.length === 0) {
            return res.status(404).send("Customer not found");
        }

        const accountId = customer[0].account_id;

        const [entries] = await pool.query(
            `SELECT 
                j.date,
                j.name,
                je.debit,
                je.credit,
                (je.debit - je.credit) AS balance
             FROM journal_entries je
             JOIN journal j ON je.journal_id = j.id
             WHERE je.account_id = ?
             ORDER BY j.date ASC`,
            [accountId]
        );

        res.render("customer/ledger", { entries });

    } catch (error) {

        console.error(error);
        res.status(500).send("Unable to load ledger");

    }
};



// ===============================
// VIEW COMPLAINTS
// ===============================
exports.complaints = async (req, res) => {

    try {

        const customerId = req.session.user.customer_id;

        const [complaints] = await pool.query(
            `SELECT id, message, status, date, feedback
             FROM complaints
             WHERE customer_id = ?
             ORDER BY id DESC`,
            [customerId]
        );

        res.render("customer/complaints", { complaints });

    } catch (error) {

        console.error(error);
        res.status(500).send("Unable to load complaints");

    }
};



// ===============================
// ADD COMPLAINT
// ===============================
exports.addComplaint = async (req, res) => {

    try {

        const customerId = req.session.user.customer_id;
        const { message } = req.body;

        if (!message || message.trim() === "") {
            return res.redirect("/customer/complaints?error=Message required");
        }

        await pool.query(
            `INSERT INTO complaints (customer_id, message, status, date)
             VALUES (?, ?, 'pending', NOW())`,
            [customerId, message]
        );

        res.redirect("/customer/complaints?success=Complaint submitted");

    } catch (error) {

        console.error(error);
        res.redirect("/customer/complaints?error=Unable to submit complaint");

    }
};

// ===============================
// ADD FEEDBACK
// ===============================
exports.addFeedback = async (req, res) => {
    try {
        const customerId = req.session.user.customer_id;
        const { rating } = req.body;          // 1-5 stars
        const complaintId = req.params.id;    // complaint ID from URL

        if (!rating || rating < 1 || rating > 5) {
            return res.redirect("/customer/complaints?error=Invalid rating");
        }

        // Optional: check if the complaint belongs to this customer
        const [complaint] = await pool.query(
            `SELECT id FROM complaints WHERE id = ? AND customer_id = ?`,
            [complaintId, customerId]
        );

        if (complaint.length === 0) {
            return res.redirect("/customer/complaints?error=Complaint not found");
        }

        // Update feedback
        await pool.query(
            `UPDATE complaints SET feedback = ? WHERE id = ?`,
            [rating, complaintId]
        );

        res.redirect("/customer/complaints?success=Feedback submitted");

    } catch (error) {
        console.error(error);
        res.redirect("/customer/complaints?error=Unable to submit feedback");
    }
};

exports.orderDetails = async (req, res) => {
    try {
        const customerId = req.session.user.customer_id;
        const orderId = req.params.id;

        // Fetch the order
        const [orders] = await pool.query(
            `SELECT id, date, total_amount, status, feedback
             FROM sales_orders
             WHERE id = ? AND customer_id = ?`,
            [orderId, customerId]
        );

        if (orders.length === 0) {
            return res.status(404).send("Order not found");
        }

        const order = orders[0];

        // Optional: fetch order items (if you have a sales_order_items table)
        const [items] = await pool.query(
            `SELECT p.name, si.quantity, si.sale_price, si.quantity
             FROM so_items AS si
             JOIN products AS p ON p.id = si.p_id
             WHERE si.so_id = ?`,
            [orderId]
        );

        res.render("customer/view", { order, items });

    } catch (error) {
        console.error(error);
        res.status(500).send("Unable to load order details");
    }
};