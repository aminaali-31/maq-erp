const pool = require('../../config/db'); // your MySQL pool

// 1️⃣ Main Vendor Portal: Summary
exports.vendorDashboard = async (req, res) => {
    const vendorId = req.session.user.vendor_id

    try {
        // Ledger summary: total debit, credit, balance
        const [ledgerSummary] = await pool.execute(
            `SELECT 
                SUM(CASE WHEN je.debit IS NULL THEN 0 ELSE je.debit END) AS total_debit,
                SUM(CASE WHEN je.credit IS NULL THEN 0 ELSE je.credit END) AS total_credit,
                SUM(CASE WHEN je.debit IS NULL THEN 0 ELSE je.debit END) -
                SUM(CASE WHEN je.credit IS NULL THEN 0 ELSE je.credit END) AS balance
            FROM accounts a
            JOIN journal_entries je ON je.account_id = a.id
            WHERE a.id = (SELECT account_id FROM vendors WHERE id=?)`,
            [vendorId]
        );

        // Pending purchase orders
        const [pendingPO] = await pool.execute(
            `SELECT id, order_date, total_amount, status
             FROM purchase_orders
             WHERE vendor_id = ? AND status IN ('pending','payment pending')
             ORDER BY order_date DESC`,
            [vendorId]
        );

        res.render('vendor/dashboard', {
            ledger: ledgerSummary[0],
            pendingOrders: pendingPO
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading vendor dashboard');
    }
};

// 2️⃣ Vendor Orders Page
exports.vendorOrders = async (req, res) => {
    const vendorId = req.session.user.vendor_id

    try {
        const [orders] = await pool.execute(
            `SELECT id, order_date, total_amount, status
             FROM purchase_orders
             WHERE vendor_id = ?
             ORDER BY order_date DESC`,
            [vendorId]
        );

        res.render('vendor/orders', { orders });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading vendor orders');
    }
};

// 3️⃣ Vendor Ledger Page
exports.vendorLedger = async (req, res) => {
    const vendorId = req.session.user.vendor_id

    try {
        const [ledgerEntries] = await pool.execute(
            `SELECT j.date, je.debit, je.credit,
                    (SUM(je.debit - je.credit) OVER (ORDER BY j.date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) AS running_balance
             FROM accounts a
             LEFT JOIN journal_entries je ON je.account_id = a.id
             LEFT JOIN journal j ON j.id = je.journal_id
             WHERE a.id = (SELECT account_id FROM vendors WHERE id=?)
             ORDER BY j.date`,
            [vendorId]
        );

        res.render('vendor/ledger', { ledgerEntries });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading vendor ledger');
    }
};