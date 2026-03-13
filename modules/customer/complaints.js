const pool = require('../../config/db')

exports.listComplaints = async (req, res) => {
    try {

        const [complaints] = await pool.query(`
            SELECT 
                c.id,
                c.message,
                c.status,
                c.date,
                ct.name AS name
            FROM complaints c
            LEFT JOIN customers ct ON ct.id = c.customer_id
            ORDER BY c.date DESC
        `);

        res.render('customer/viewComplaints', {
            complaints,
            success: req.query.success,
            error: req.query.error
        });

    } catch (err) {
        console.error(err);
        res.send("Error loading complaints");
    }
};

exports.changeComplaintStatus = async (req, res) => {
    try {

        const complaintId = req.params.id;
        const status = req.query.status;

        if (!complaintId || !status) {
            return res.redirect('/customer/view/complaints?error=Missing parameters');
        }

        await pool.execute(
            `UPDATE complaints SET status = ? WHERE id = ?`,
            [status, complaintId]
        );

        res.redirect('/customer/view/complaints?success=Status updated');

    } catch (err) {
        console.error(err);
        res.redirect('/customer/view/complaints?error=Failed to update status');
    }
};