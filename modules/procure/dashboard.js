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
        const [pendingReceivables] = await pool.execute(`
            SELECT IFNULL(SUM(total_amount),0) AS pendingReceivables
            FROM sales_orders
            WHERE status != 'completed'
        `);

        // Purchase Orders Summary
        const [purchaseSummary] = await pool.execute(`
            SELECT COUNT(*) AS totalPO,
                   IFNULL(SUM(CASE 
                        WHEN status!='Paid' 
                        THEN total_amount ELSE 0 END),0) AS pendingPayables
            FROM purchase_orders
        `);

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
                pendingReceivables: pendingReceivables[0].pendingReceivables,

                totalPO: purchaseSummary[0].totalPO,
                pendingPayables: purchaseSummary[0].pendingPayables,

                totalProducts: productCount[0].totalProducts,
                lowStockCount: lowStock[0].lowStockCount
            },

            recentSalesOrders,
            recentPOs,
            monthlySales,
            monthlyPurchases
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Dashboard Loading Error");
    }
};