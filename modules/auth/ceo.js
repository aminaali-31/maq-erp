const pool = require("../../config/db");

exports.dashboard = async (req, res) => {
  try {
    const userId = req.session.user.role_id;
    /* =========================
       Revenue / Expense / Profit
    ========================= */

    const [finance] = await pool.query(`
      SELECT
        SUM(CASE WHEN a.name='Sales Revenue' THEN je.credit-je.debit ELSE 0 END) AS revenue,
        SUM(CASE WHEN a.name='expense' THEN je.debit-je.credit ELSE 0 END) AS expenses
      FROM journal_entries je
      JOIN accounts a ON a.id = je.account_id
      JOIN journal j ON j.id = je.journal_id
        WHERE MONTH(j.date) = MONTH(CURDATE())
        AND YEAR(j.date) = YEAR(CURDATE())
    `);

    const revenue = finance[0].revenue || 0;
    const expenses = finance[0].expenses || 0;
    const [[orderProfit]] = await pool.query(`
        SELECT COALESCE(SUM(profit),0) AS total_profit
        FROM sales_orders
        WHERE MONTH(date)=MONTH(CURDATE())
        AND YEAR(date)=YEAR(CURDATE())
        `);
    const profit = orderProfit.total_profit - expenses;
    /* =========================
       KPI Counters
    ========================= */

    const [[customers]] = await pool.query(
      "SELECT COUNT(*) total FROM customers"
    );

    const [[vendors]] = await pool.query(
      "SELECT COUNT(*) total FROM vendors"
    );

    const [[products]] = await pool.query(
      "SELECT COUNT(*) total FROM products"
    );

    const [[orders]] = await pool.query(
      "SELECT COUNT(*) total FROM sales_orders"
    );

    /* =========================
       Financial Risks
    ========================= */

    const [[receivables]] = await pool.execute(`
            SELECT 
                COALESCE(SUM(je.debit - je.credit),0) AS balance
            FROM customers c
            LEFT JOIN accounts a 
                ON c.account_id = a.id
            LEFT JOIN journal_entries je 
                ON je.account_id = a.id
        `);

    const [[payables]] = await pool.execute(`
        SELECT COALESCE(SUM(je.credit - je.debit),0) AS balance
        FROM journal_entries je
        WHERE je.account_id IN (
            SELECT account_id FROM vendors WHERE account_id IS NOT NULL
        )
    `);
    const [[lowStock]] = await pool.query(`
        SELECT p.reorder_level, il.quantity AS total
        FROM products p
        JOIN inventory_level il ON il.product_id = p.id
        GROUP BY p.id
        HAVING SUM(il.quantity) < p.reorder_level;
    `);

    const [[complaints]] = await pool.query(`
      SELECT COUNT(*) total
      FROM complaints
      WHERE status='pending'
    `);


    /* =========================
       Top Customers
    ========================= */

    const [topCustomers] = await pool.query(`
      SELECT c.name, SUM(so.total_amount) revenue
      FROM sales_orders so
      JOIN customers c ON c.id=so.customer_id
      GROUP BY c.id
      ORDER BY revenue DESC
      LIMIT 5
    `);

    /* =========================
       Top Products
    ========================= */

    const [topProducts] = await pool.query(`
      SELECT p.name, SUM(oi.quantity) sold
      FROM so_items oi
      JOIN products p ON p.id=oi.p_id
      GROUP BY p.id
      ORDER BY sold DESC
      LIMIT 5
    `);

    /* =========================
       Top Vendors
    ========================= */

    const [topVendors] = await pool.query(`
      SELECT v.name, SUM(po.total_amount) purchases
      FROM purchase_orders po
      JOIN vendors v ON v.id=po.vendor_id
      GROUP BY v.id
      ORDER BY purchases DESC
      LIMIT 5
    `);
    const [chart] = await pool.query(`
            SELECT
                MONTH(j.date) AS month,
                SUM(CASE WHEN a.name = 'Sales Revenue' THEN je.credit - je.debit ELSE 0 END) AS sales,
                SUM(CASE WHEN a.name = 'Stocks' THEN je.debit - je.credit ELSE 0 END) AS purchases
            FROM journal_entries je
            JOIN accounts a ON je.account_id = a.id
            JOIN journal j ON je.journal_id = j.id
            WHERE j.date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            GROUP BY  month
            ORDER BY month
            LIMIT 12;
            `);
    // In your controller
        const [profits] = await pool.query(`
           SELECT
            s.month,
            COALESCE(s.sales_profit,0) 
            - COALESCE(e.expense,0) AS profit
        FROM
        (
            SELECT
                MONTH(date) AS month,
                SUM(profit) AS sales_profit
            FROM sales_orders
            WHERE date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
            GROUP BY MONTH(date)
        ) s
        LEFT JOIN
        (
            SELECT
                MONTH(j.date) AS month,
                SUM(je.debit) AS expense
            FROM journal_entries je
            JOIN accounts a ON je.account_id = a.id
            JOIN journal j ON je.journal_id = j.id
            WHERE a.name = 'expense'
            GROUP BY MONTH(j.date)
        ) e
        ON s.month = e.month
        ORDER BY s.month;
        `);
        const [rows] = await pool.execute(
            `SELECT COUNT(*) AS count
             FROM notifications
             WHERE user_id = ? AND is_read = 0`,
            [userId]
        );
        const not = rows[0].count

         const [notifications] = await pool.execute(
            `SELECT *
             FROM notifications
             WHERE user_id = ?
             AND is_read = FALSE
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId]
        );

    res.render("ceo/dashboard", {
      revenue,
      expenses,
      orderProfit,
      profit,
      profits,
      customers: customers.total,
      vendors: vendors.total,
      products: products.total,
      orders: orders.total,
      receivables: receivables.balance || 0,
      payables: payables.balance || 0,
      lowStock: lowStock.total,
      complaints: complaints.total,
      chart,
      topCustomers,
      topProducts,
      topVendors,
      not,
      notifications,
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};


exports.markAsRead = async (req, res) => {

    const id = req.params.id;

    await pool.execute(
        `UPDATE notifications
         SET is_read = 1
         WHERE id = ?`,
        [id]
    );

    res.sendStatus(200);
};

exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.session.user.id;

        const [rows] = await pool.execute(
            `SELECT COUNT(*) AS count
             FROM notifications
             WHERE user_id = ? AND is_read = 0`,
            [userId]
        );

        res.json({ count: rows[0].count });

    } catch (err) {
        console.error(err);
        res.json({ count: 0 });
    }
};

exports.createJobForm = async (req, res) => {
    try {

        const [employees] = await pool.execute(
            `SELECT id, name FROM employees`
        );

        res.render('jobs/create', {
            employees,
            error: req.query.error || null,
            success: req.query.success || null
        });

    } catch (err) {
        console.error(err);
        res.redirect('/admin/jobs/all?error=' + encodeURIComponent(err.message));
    }
};

exports.createJob = async (req, res) => {

    const { title, description, employee_id, show_date, due_date } = req.body;

    if (!title || !employee_id || !show_date) {
        return res.redirect('/admin/jobs/create?error=Required fields missing');
    }

    try {

        await pool.execute(
            `INSERT INTO jobs
            (title, description, employee_id, show_date, due_date, status)
            VALUES (?, ?, ?, ?, ?, 'PENDING')`,
            [title, description, employee_id, show_date, due_date]
        );

        res.redirect('/admin/jobs/all?success=Job created');

    } catch (err) {
        console.error(err);
        res.redirect('/admin/jobs/create?error=' + encodeURIComponent(err.message));
    }
};


exports.showAllJobs = async (req,res) => {
  try {

    const [jobs] =await pool.execute(`
      SELECT * FROM jobs
      ORDER BY
      CASE status
        WHEN 'PENDING' THEN 1
        WHEN 'IN_PROGRESS' THEN 2
        WHEN 'COMPLETED' THEN 3
        WHEN 'CANCELLED' THEN 4
        ELSE 5
    END;`);

    res.render('jobs/all', {jobs, success:req.query.success, error: req.query.error});
  } catch (e) {
       console.error(e);
      res.status(500).send("Database Error");
  }
}

exports.changeJobStatus = async (req, res) => {
    try {
        const jobId = req.params.id;
        const status = req.query.status;

        if (!jobId || !status) {
            return res.redirect('/admin/jobs/all?error=Missing parameters');
        }

        await pool.execute(
            `UPDATE jobs SET status = ? WHERE id = ?`,
            [status, jobId]
        );

        res.redirect('/admin/jobs/all?success=Status updated');

    } catch (err) {
        console.error(err);
        res.redirect('/admin/jobs/all?error=Unable to update status');
    }
};


exports.setJobComment = async (req, res) => {
    const conn = await pool.getConnection();
    const backURL = req.get('Referer') || '/'; // fallback to homepage if no referer
    try {
        const job_id = req.params.id;
        const { comment } = req.body;

        if (!job_id || !comment) {
            return res.status(400).json({ error: 'Job ID and comment are required' });
        }

        // Update the job's comment
        const [result] = await conn.execute(
            `UPDATE jobs SET comment = ? WHERE id = ?`,
            [comment, job_id]
        );
            // 2️⃣ Notify CEO (example user_id = 1)
        await pool.execute(
            `INSERT INTO notifications (user_id, title, message, link)
             VALUES (?, ?, ?, ?)`,
            [
                1, // CEO user id
                "Job Comment Updated",
                `Comment updated for Job #${job_id}`,
                `/admin/jobs/all`
            ]
        );

        if (result.affectedRows === 0) {
            return res.redirect(backURL);
        }

        return res.redirect(backURL);

    } catch (err) {
        console.error(err); // fallback to homepage if no referer
        return res.redirect(backURL);
    } finally {
        conn.release();
    }
};