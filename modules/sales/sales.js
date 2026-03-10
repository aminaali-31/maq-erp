const pool = require('../../config/db');



exports.showOrderForm = async (req, res) => {
    try {

        // =============================
        // Get Customers
        // =============================
        const [customers] = await pool.execute(`
            SELECT id , name FROM customers
        `);

        // =============================
        // Get Products
        // =============================
        const [products] = await pool.execute(`
            SELECT 
                p.id AS product_id,
                p.name,
                p.sale_price,
                b.id AS batch_id,
                b.batch_no,
                b.qty_remaining,
                b.cost_price
            FROM products p
            JOIN inventory_batches b 
            ON b.product_id = p.id
            WHERE b.qty_remaining > 0
            `);
        
       
        const productOptions = products.map(p => ({
            value: JSON.stringify({
                product_id: p.product_id,
                batch_id: p.batch_id,
                sale_price: Number(p.sale_price),
                cost_price: Number(p.cost_price),
                stock: Number(p.qty_remaining)
            }),
            label: `${p.name} | Batch ${p.batch_no} | Stock:${p.qty_remaining} |  Cost:${p.cost_price}`
        }));

        res.render('sales/add', {
            customers,
            productOptions,
            success: req.query.success,
            error: req.query.error
        });

    } catch (e) {
        console.error(e);
        res.status(500).send('Server Error');
    }
};

exports.createSalesOrder = async (req, res) => {
    const { customer_id, p_status, o_status, items } = req.body;

    if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
        return res.redirect('/sales/orders/new?error=Customer and items are required');
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // ===============================
        // Create Sales Order Header FIRST
        // ===============================
        const [orderResult] = await connection.query(`
            INSERT INTO sales_orders
            (customer_id, status, progress, profit, date, total_amount)
            VALUES (?, ?, ?, 0, NOW(), 0)
        `, [
            customer_id,
            p_status || 'pending',
            o_status || 'pending'
        ]);

        const sales_order_id = orderResult.insertId;

        // ===============================
        // Calculate Profit + Process Items
        // ===============================
        let total_profit = 0;
        let total_amount = 0;

        for (const item of items) {
            if (!item.product_data) {
                throw new Error("Product data missing for an item");
            }

            const productData = JSON.parse(item.product_data);
            const product_id = productData.product_id;
            const batch_id = productData.batch_id;
            const quantity = Number(item.quantity);
            const sale_price = Number(item.sale_price);

            // ===============================
            // Validate warranty date
            // ===============================
            const warranty =  new Date(item.warranty);

            total_amount += sale_price * quantity;

            if (!quantity || quantity <= 0) {
                throw new Error("Invalid quantity for product " + product_id);
            }

            // ===============================
            // Check batch stock
            // ===============================
            const [batchRows] = await connection.query(`
                SELECT qty_remaining, cost_price
                FROM inventory_batches
                WHERE id = ? AND product_id = ?
            `, [batch_id, product_id]);

            if (!batchRows.length) {
                throw new Error(`Batch ${batch_id} for product ${product_id} not found`);
            }

            const batch = batchRows[0];
            if (quantity > batch.qty_remaining) {
                throw new Error(`Batch stock insufficient for product ${product_id}`);
            }

            const cost_price = Number(batch.cost_price);
            const profit = (sale_price - cost_price) * quantity;
            total_profit += profit;

            // ===============================
            // Deduct batch stock
            // ===============================
            await connection.query(`
                UPDATE inventory_batches
                SET qty_remaining = qty_remaining - ?
                WHERE id = ?
            `, [quantity, batch_id]);

            // ===============================
            // Insert stock movement
            // ===============================
            await connection.query(`
                INSERT INTO stock_mov
                (product_id, batch_id, quantity, movement_type, cost_price, reference_id, reference_type, date)
                VALUES (?, ?, ?, 'OUT', ?, ?, 'Sales Order', NOW())
            `, [product_id, batch_id, quantity, cost_price, sales_order_id]);

            // ===============================
            // Insert order item
            // ===============================
            await connection.query(`
                INSERT INTO so_items
                (so_id, p_id, batch_id, quantity, sale_price, warranty)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                sales_order_id,
                product_id,
                batch_id,
                quantity,
                sale_price,
                warranty
            ]);
        }

        // ===============================
        // Update Sales Order totals
        // ===============================
        await connection.query(`
            UPDATE sales_orders
            SET profit = ?, total_amount = ?
            WHERE id = ?
        `, [
            Number(total_profit).toFixed(2),
            total_amount,
            sales_order_id
        ]);

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



// List all sales orders
exports.listSalesOrders = async (req, res) => {
    try {

        const [orders] = await pool.execute(`
            SELECT 
                so.id,
                c.name AS customer_name,
                so.total_amount,
                so.status,
                so.progress,
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

        const { order_id, status, progress } = req.body;
        let id = parseInt(order_id);
        
        if (!order_id || !status || !progress) {
            return res.redirect('/sales?error=Order id and status required');
        }

        await pool.execute(
            "UPDATE sales_orders SET status=?, progress= ? WHERE id=?",
            [status,progress,id]
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
                si.p_id,
                p.name AS product_name,
                si.warranty,
                SUM(si.quantity) AS total_quantity,
                si.sale_price
            FROM so_items si
            JOIN products p ON si.p_id = p.id
            WHERE si.so_id = ?
            GROUP BY si.p_id, si.sale_price, p.name,si.warranty
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

// controllers/salesController.js
exports.editOrderForm = async (req, res) => {
    try {
        const orderId = req.params.id;

        // 1️⃣ Get the order
        const [orders] = await pool.execute(
            `SELECT * FROM sales_orders WHERE id = ? AND status = 'pending'`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.redirect('/sales/orders?error=Order cannot be edited');
        }

        const order = orders[0];

        // 2️⃣ Load order items
        const [items] = await pool.execute(
            `SELECT * FROM so_items WHERE so_id = ?`,
            [orderId]
        );

        // 3️⃣ Get all product batches with stock
        const [products] = await pool.execute(`
            SELECT 
                p.id AS product_id,
                p.name,
                p.sale_price,
                b.id AS batch_id,
                b.batch_no,
                b.qty_remaining,
                b.cost_price
            FROM products p
            JOIN inventory_batches b ON b.product_id = p.id
            WHERE b.qty_remaining > 0
        `);

        // 4️⃣ Prepare product options
        let productOptions = products.map(p => ({
            value: JSON.stringify({
                product_id: p.product_id,
                batch_id: p.batch_id,
                sale_price: Number(p.sale_price),
                cost_price: Number(p.cost_price),
                stock: Number(p.qty_remaining)
            }),
            label: `${p.name} | Batch ${p.batch_no} | Stock:${p.qty_remaining} | Cost:${p.cost_price}`,
            product_id: p.product_id,
            batch_id: p.batch_id,
            selected: false // default, will mark later
        }));

        // 5️⃣ Add sale order items that may have zero stock
        for (const item of items) {
            const exists = productOptions.find(opt => 
                opt.product_id == item.p_id && opt.batch_id == item.batch_id
            );

            if (!exists) {
                const [[batch]] = await pool.execute(`
                    SELECT 
                        p.id AS product_id,
                        p.name,
                        p.sale_price,
                        b.id AS batch_id,
                        b.batch_no,
                        b.qty_remaining,
                        b.cost_price
                    FROM products p
                    JOIN inventory_batches b ON b.product_id = p.id
                    WHERE b.id = ?
                `, [item.batch_id]);

                if (batch) {
                    productOptions.push({
                        value: JSON.stringify({
                            product_id: batch.product_id,
                            batch_id: batch.batch_id,
                            sale_price: Number(batch.sale_price),
                            cost_price: Number(batch.cost_price),
                            stock: Number(batch.qty_remaining)
                        }),
                        label: `${batch.name} | Batch ${batch.batch_no} | Stock:${batch.qty_remaining} | Cost:${batch.cost_price}`,
                        product_id: batch.product_id,
                        batch_id: batch.batch_id,
                        selected: false
                    });
                }
            }
        }

        // 6️⃣ Mark selected items
        productOptions = productOptions.map(opt => {
            const selectedItem = items.find(item => 
                item.p_id == opt.product_id && item.batch_id == opt.batch_id
            );
            return {
                ...opt,
                selected: !!selectedItem
            };
        });

        // 7️⃣ Deduplicate productOptions
        const seen = new Set();
        productOptions = productOptions.filter(opt => {
            const key = `${opt.product_id}-${opt.batch_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // 8️⃣ Render
        res.render('sales/edit', {
            order,
            items,
            productOptions,
            error: req.query.error,
            success: req.query.success
        });

    } catch (error) {
        console.error(error);
        res.status(500).send("Server Error");
    }
};

exports.updateEditOrder = async (req, res) => {

    const connection = await pool.getConnection();

    try {

        await connection.beginTransaction();

        const orderId = req.params.id;
        const items = req.body.items; // array of order items

        /*
        items format expected:
        [
            {
                product_id,
                batch_id,
                qty,
                price
            }
        ]
        */

        // 1️⃣ Get old order items
        const [oldItems] = await connection.query(
            `SELECT p_id, quantity, batch_id,sale_price
             FROM so_items 
             WHERE so_id = ?`,
            [orderId]
        );


        // 2️⃣ Restore previous stock
        for (const item of oldItems) {
            
            // restore batch stock
            await connection.query(`
                UPDATE inventory_batches
                SET qty_remaining = qty_remaining + ?
                WHERE id = ?
            `, [item.quantity, item.batch_id]);

             await connection.query(`
                    INSERT INTO stock_mov
                    (product_id, batch_id, quantity, movement_type, reference_type, reference_id,cost_price)
                    VALUES (?, ?, ?, 'IN', 'sales_order', ?,?)
                `, [item.p_id, item.batch_id, item.quantity, orderId,item.sale_price]);
        }

        // 3️⃣ Delete previous order items
        await connection.query(
            `DELETE FROM so_items WHERE so_id = ?`,
            [orderId]
        );


        // 4️⃣ Insert new items and deduct stock
        for (const item of items) {
            const productData = JSON.parse(item.product_data);
            console.log(productData)
            const batch_id = productData.batch_id;
            const product_id = productData.product_id;
            const qty = Number(item.quantity);
            const price = Number(item.sale_price);

            // Check batch stock
            const [batch] = await connection.query(`
                SELECT qty_remaining
                FROM inventory_batches
                WHERE id = ?
            `, [batch_id]);

            if (batch.length === 0) {
                throw new Error("Batch not found");
            }

            if (batch[0].qty_remaining < qty) {
                throw new Error("Not enough stock for selected batch");
            }

            // Deduct batch stock
            await connection.query(`
                UPDATE inventory_batches
                SET qty_remaining = qty_remaining - ?
                WHERE id = ?
            `, [qty, batch_id]);

            // record stock movement (OUT)
            await connection.query(`
                INSERT INTO stock_mov
                (product_id, batch_id, quantity, movement_type, reference_type, reference_id,cost_price)
                VALUES (?, ?, ?, 'OUT', 'sales_order', ?,?)
            `, [product_id, batch_id, qty, orderId, productData.cost_price]);


            // Insert new order item
            await connection.query(`
                INSERT INTO so_items
                (so_id, p_id, batch_id, warranty,quantity, sale_price)
                VALUES (?, ?, ?,?, ?,?)
            `, [orderId, product_id,item.warranty, batch_id ,qty, price]);

        }

        await connection.commit();

        res.redirect(`/sales/orders/edit/${orderId}?success=Order updated`);

    } catch (error) {

        await connection.rollback();
        console.error(error);

        res.redirect(`/sales/orders/edit/${req.params.id}?error=${error.message}`);

    } finally {

        connection.release();

    }

};

exports.updateOrder = async (req, res) => {

    const connection = await pool.getConnection();

    try {

        const orderId = req.params.id;

        const { items, status } = req.body;

        await connection.beginTransaction();

        // =============================
        // Check Order Status First ⭐
        // =============================

        const [orders] = await connection.execute(
            `SELECT status FROM sales_orders WHERE id = ?`,
            [orderId]
        );

        if (!orders.length || orders[0].status !== 'pending') {
            throw new Error("Only pending orders can be edited");
        }

        // =============================
        // Delete old items
        // =============================

        await connection.execute(
            `DELETE FROM so_items
             WHERE sales_order_id = ?`,
            [orderId]
        );

        // =============================
        // Insert new items
        // =============================

        let totalProfit = 0;
        let total_amount = 0;

        for (let item of items) {

            const productData = JSON.parse(item.product_data);

            const product_id = productData.product_id;
            const batch_id = productData.batch_id;

            const quantity = Number(item.quantity);
            const sale_price = Number(item.sale_price);
            total_amount = total_amount + (sale_price * quantity);
            const [batchRows] = await connection.execute(
                `SELECT cost_price, qty_remaining
                 FROM inventory_batches
                 WHERE id = ?`,
                [batch_id]
            );

            if (!batchRows.length) {
                throw new Error("Invalid batch selection");
            }

            const batch = batchRows[0];

            if (quantity > batch.qty_remaining) {
                throw new Error("Batch stock insufficient");
            }

            const profit = (sale_price - batch.cost_price) * quantity;

            totalProfit += profit;

            await connection.execute(
                `INSERT INTO so_items
                (so_id, p_id,
                 quantity, sale_price)
                VALUES (?, ?, ?, ?)`,
                [
                    orderId,
                    product_id,
                    quantity,
                    sale_price,
                ]
            );
        }

        // Update profit
        await connection.execute(
            `UPDATE sales_orders
             SET profit = ?,
             total_amount = ?,
             WHERE id = ?`,
            [totalProfit.toFixed(2), total_amount.toFixed(2), orderId]
        );

        await connection.commit();

        res.redirect('/sales/orders?success=Order updated');

    } catch (error) {

        await connection.rollback();

        console.error(error.message);

        res.redirect('/sales/orders?error=' +
            encodeURIComponent(error.message));

    } finally {
        connection.release();
    }
};