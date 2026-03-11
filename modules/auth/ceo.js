const pool = require("../../config/db");

exports.dashboard = async (req, res) => {
  try {

    /* =========================
       Revenue / Expense / Profit
    ========================= */

    const [finance] = await pool.query(`
      SELECT
        SUM(CASE WHEN a.name='Sales Revenue' THEN je.credit-je.debit ELSE 0 END) AS revenue,
        SUM(CASE WHEN a.name='Office Expenses' THEN je.debit-je.credit ELSE 0 END) AS expenses
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

    const [receivables] = await pool.execute(`
            SELECT 
                COALESCE(SUM(je.debit - je.credit),0) AS balance
            FROM customers c
            LEFT JOIN accounts a 
                ON c.account_id = a.id
            LEFT JOIN journal_entries je 
                ON je.account_id = a.id
        `);

        const [payables] = await pool.execute(`
            SELECT 
                COALESCE(SUM(je.credit - je.debit),0) AS balance
            FROM vendors v
            LEFT JOIN accounts a 
                ON v.account_id = a.id
            LEFT JOIN journal_entries je 
                ON je.account_id = a.id
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
                MONTH(so.date) AS month,
                SUM(so.profit) - COALESCE(SUM(e.expense),0) AS profit
            FROM sales_orders so
            LEFT JOIN
            (
                SELECT
                    MONTH(j.date) AS month,
                    SUM(je.debit) AS expense
                FROM journal_entries je
                JOIN accounts a ON je.account_id = a.id
                JOIN journal j ON je.journal_id = j.id
                WHERE a.name = 'Office Expenses'
                GROUP BY MONTH(j.date)
            ) e ON e.month = MONTH(so.date)
            WHERE so.date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
            GROUP BY MONTH(so.date)
            ORDER BY MONTH(so.date);
        `);

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
      receivables: receivables.total || 0,
      payables: payables.total || 0,
      lowStock: lowStock.total,
      complaints: complaints.total,
      chart,
      topCustomers,
      topProducts,
      topVendors
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};