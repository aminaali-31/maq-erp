const pool = require('../../config/db'); // your database connection

exports.getDashboard = async (req, res) => {
    try {
        // Pending Sale Orders
        const [pendingSales] = await pool.execute(
            `SELECT so.id, so.total_amount, so.customer_id, c.name AS customer_name, so.date 
             FROM sales_orders AS so
             JOIN customers AS c ON c.id = so.customer_id
             WHERE so.status = 'pending'
             ORDER BY so.date DESC`
        );

        // Pending Complaints
        const [pendingComplaints] = await pool.execute(
            `SELECT comp.id, comp.message, comp.customer_id, c.name AS customer_name, comp.date
             FROM complaints AS comp
             JOIN customers AS c ON c.id = comp.customer_id
             WHERE comp.status IN ('pending', 'in_progress')
             ORDER BY comp.date DESC`
        );

        // Pending Approvals (example: purchase approvals)
         const [approvals] = await pool.query(
            `SELECT ra.id, u.username, u.email, r.name AS role_name
             FROM role_approvals ra
             JOIN users u ON u.id = ra.user_id
             JOIN roles r ON r.id = ra.requested_role_id
             WHERE ra.status = 'inactive' or ra.status = 'pending'`
        )

        res.render('pendings', {
            pendingSales,
            pendingComplaints,
            approvals,
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};