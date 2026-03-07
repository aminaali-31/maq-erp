const pool = require('../../config/db');



exports.showOrderForm = async (req, res) => {
    try {
        const [customers] = await pool.execute('SELECT id , name FROM customers');
        const [products] = await pool.execute(`
            SELECT 
                p.id,
                p.name,
                p.sale_price,
                IFNULL(s.quantity,0) AS available_qty
            FROM products p
            LEFT JOIN inventory_level s ON s.product_id = p.id
        `);

        res.render('sales/add', { customers, products, success: req.query.success, error: req.query.error });
    } catch (e) {
        res.status(500).send('Server Error');
    }
}
exports.createSalesOrder = async (req, res) => {

    const { customer_id, status, items } = req.body;

    if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
        return res.redirect('/sales/orders/new?error=Customer and items are required');
    }

    const connection = await pool.getConnection();

    try {

        await connection.beginTransaction();

        // ===============================
        // Calculate total amount
        // ===============================
        let total_amount = 0;
        let total_profit = 0;
        for (const item of items) {
            total_amount += Number(item.quantity) * Number(item.sale_price);
        }

        // ===============================
        // Insert Sales Order
        // ===============================
        const [orderResult] = await connection.query(
            `INSERT INTO sales_orders (customer_id, status, total_amount,profit)
       VALUES (?, ?, ?,?)`,
            [customer_id, status || 'pending', total_amount, 0]
        );

        const sales_order_id = orderResult.insertId;

        // ===============================
        // Process Items
        // ===============================
        for (const item of items) {

            // ---------- Stock Check ----------
            const [stock] = await connection.query(
                `SELECT quantity
                FROM inventory_level
                WHERE product_id=?`,
                [item.product_id]
            );

            const available = stock.length ? Number(stock[0].available_quantity) : 0;

            if (item.quantity > available) {
                throw new Error(`Insufficient stock for product ${item.product_id}`);
            }

            // ---------- FIFO Cost Fetch (Important) ----------
            const cost_price = await getWeightedAverageCost(connection, item.product_id);
            const profit =
                (Number(item.sale_price) - Number(cost_price)) *
                Number(item.quantity);

            total_profit += profit;
            // ---------- Insert Stock Movement OUT ----------
            await connection.query(`
        INSERT INTO stock_mov
        (product_id, quantity, movement_type, cost_price, reference_id,reference_type)
        VALUES (?, ?, 'OUT', ?, ?,'Sales Order')
      `, [
                item.product_id,
                item.quantity,
                cost_price,
                sales_order_id
            ]);

            // ---------- Insert Order Item ----------
            await connection.query(`
        INSERT INTO so_items
        (so_id, p_id, quantity, sale_price)
        VALUES (?, ?, ?, ?)
      `, [
                sales_order_id,
                item.product_id,
                item.quantity,
                item.sale_price
            ]);
        }
        await connection.query(
            `UPDATE sales_orders SET profit = ? WHERE id = ?`, [ Number(total_profit || 0).toFixed(2), sales_order_id]
        );

        await connection.commit();

        return res.redirect('/sales/orders/new?success=Sales order created successfully');

    } catch (error) {

        await connection.rollback();

        console.error(error.message);

        return res.redirect('/sales/orders/new?error=' + encodeURIComponent(error.message));

    } finally {
        connection.release();
    }
};


// ===============================
// FIFO Cost Helper Function
// ===============================
async function getWeightedAverageCost(connection, product_id) {

    const [rows] = await connection.query(`
        SELECT
        SUM(CASE WHEN movement_type='IN' THEN quantity ELSE 0 END) AS total_in_qty,
        SUM(CASE WHEN movement_type='IN' THEN quantity * cost_price ELSE 0 END) AS total_value
        FROM stock_mov
        WHERE product_id=?
    `, [product_id]);

    const data = rows[0];

    if (!data.total_in_qty || data.total_in_qty === 0) return 0;

    return Number(data.total_value) / Number(data.total_in_qty);
}

// List all sales orders
exports.listSalesOrders = async (req, res) => {
    try {

        const [orders] = await pool.execute(`
            SELECT 
                so.id,
                c.name AS customer_name,
                so.total_amount,
                so.status,
                so.date
            FROM sales_orders so
            LEFT JOIN customers c ON so.customer_id = c.id
            ORDER BY so.id DESC
        `);

        res.render('sales/list', {
            orders,
            success: req.query.success,
            error: req.query.error
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};


// Update order status only
exports.updateOrderStatus = async (req, res) => {
    try {

        const { order_id, status } = req.body;
        
        if (!order_id || !status) {
            return res.redirect('/sales?error=Order id and status required');
        }

        await pool.execute(
            "UPDATE sales_orders SET status=? WHERE id=?",
            [status, order_id]
        );

        res.redirect('/sales/orders?success=Status updated');

    } catch (err) {
        console.error(err);
        res.redirect('/sales/orders?error=Update failed');
    }
};


exports.viewSalesOrder = async (req, res) => {
    try {

        const order_id = req.params.id;

        // Order + Customer
        const [orderRows] = await pool.execute(`
            SELECT 
                so.*,
                c.name AS customer_name,
                c.phone,
                c.address
            FROM sales_orders so
            LEFT JOIN customers c ON so.customer_id = c.id
            WHERE so.id = ?
        `, [order_id]);

        if (orderRows.length === 0) {
            return res.redirect('/sales/orders?error=Order not found');
        }

        const order = orderRows[0];

        // Order items
        const [items] = await pool.execute(`
            SELECT 
                soi.*,
                p.name AS product_name
            FROM so_items soi
            LEFT JOIN products p ON soi.p_id = p.id
            WHERE soi.so_id = ?
        `, [order_id]);

        res.render('sales/view', {
            order,
            items
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};