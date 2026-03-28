const pool = require('../../config/db');

/*
========================================
 Manager Dashboard Controller
========================================
*/

exports.getManagerDashboard = async (req, res) => {
    try {

        /*
        -------------------------------------------------
        Summary Metrics Queries
        -------------------------------------------------
        */

        // Total Sales
        const [salesTotal] = await pool.execute(`
            SELECT IFNULL(SUM(total_amount),0) AS totalSales,
                   IFNULL(SUM(profit),0) AS totalProfit,
                   COUNT(*) AS totalOrders
            FROM sales_orders
        `);

        // Pending Customer Receivables
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
        const [[po]] = await pool.execute(`
            SELECT COUNT(*) AS total_po FROM purchase_orders`)
        // Total Products
        const [productCount] = await pool.execute(`
            SELECT COUNT(*) AS totalProducts
            FROM products
            WHERE is_active='yes'
        `);

        // Low Stock Count
        const [lowStock] = await pool.execute(`
            SELECT COUNT(*) AS lowStockCount
            FROM inventory_level il
            JOIN products p ON il.product_id = p.id
            WHERE il.quantity <= IFNULL(p.reorder_level,0)
        `);

        /*
        -------------------------------------------------
        Latest Orders Tables
        -------------------------------------------------
        */

        // Latest Sales Orders
        const [recentSalesOrders] = await pool.execute(`
            SELECT 
                so.id,
                c.name AS customer,
                so.total_amount,
                so.status
            FROM sales_orders so
            JOIN customers c ON so.customer_id = c.id
            ORDER BY so.date DESC
            LIMIT 5
        `);

        // Latest Purchase Orders
        const [recentPOs] = await pool.execute(`
            SELECT 
                po.id,
                v.name AS vendor,
                po.total_amount,
                po.status
            FROM purchase_orders po
            JOIN vendors v ON po.vendor_id = v.id
            ORDER BY po.order_date DESC
            LIMIT 5
        `);
                // Monthly Sales Analytics
        const [monthlySales] = await pool.execute(`
        SELECT 
            MONTH(date) AS month_num,
            DATE_FORMAT(date,'%b') AS month,
            SUM(total_amount) AS totalSales,
            COUNT(*) AS totalOrders
        FROM sales_orders
        GROUP BY month_num, month
        ORDER BY month_num
        `);
        const [monthlyPurchases] = await pool.execute(`
            SELECT 
                MONTH(order_date) AS month_num,
                DATE_FORMAT(order_date,'%b') AS month,
                SUM(total_amount) AS totalPurchases,
                COUNT(*) AS totalPO
            FROM purchase_orders
            GROUP BY month_num, month
            ORDER BY month_num
        `);
        const [jobs] = await pool.execute(
            `SELECT *
            FROM jobs
            WHERE status IN ('PENDING','IN_PROGRESS')
            AND show_date <= CURDATE()
            ORDER BY show_date DESC`,
            [req.session.user.id]
        );

        const [po_items] = await pool.execute(
            `SELECT 
                c.id AS category_id,
                c.name AS category_name,
                SUM(q.quantity) AS total_quantity
            FROM products p
            JOIN categories c ON c.id = p.category_id
            LEFT JOIN inventory_level q ON q.product_id = p.id
            GROUP BY c.id, c.name`
        );
        /*
        -------------------------------------------------
        Render Dashboard View
        -------------------------------------------------
        */

        res.render('procure/manager', {
            summary: {
                totalSales: salesTotal[0].totalSales,
                totalProfit: salesTotal[0].totalProfit,
                totalOrders: salesTotal[0].totalOrders,
                pendingReceivables: receivables.balance,

                totalPO: po.total_po,
                pendingPayables: payables.balance,

                totalProducts: productCount[0].totalProducts,
                lowStockCount: lowStock[0].lowStockCount
            },
            po_items,
            recentSalesOrders,
            recentPOs,
            monthlySales,
            jobs,
            monthlyPurchases
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Dashboard Loading Error");
    }
};


exports.getManagerUpdates = async (req, res) => {
    try {

        const [orders] = await pool.execute(
            "SELECT COUNT(*) AS total FROM sales_orders WHERE status='pending'"
        );

        const [complaints] = await pool.execute(
            "SELECT COUNT(*) AS total FROM complaints WHERE status='pending'"
        );

        const [purchases] = await pool.execute(
            "SELECT COUNT(*) AS total FROM jobs WHERE status='PENDING'"
        );

        let messageParts = [];

        if (orders[0].total > 0) {
            messageParts.push(`${orders[0].total} pending sale orders`);
        }

        if (complaints[0].total > 0) {
            messageParts.push(`${complaints[0].total} complaints`);
        }

        if (purchases[0].total > 0) {
            messageParts.push(`${purchases[0].total} jobs pendings`);
        }

        let message;

        if (messageParts.length === 0) {
            message = "You currently have no pending items.";
        } else {
            message = "You have " + messageParts.join(", ");
        }

        res.json({ message });

    } catch (err) {
        console.error(err);
        res.json({ message: "There was an error retrieving updates." });
    }
};