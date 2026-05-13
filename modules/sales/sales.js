const pool = require('../../config/db');



exports.showOrderForm = async (req, res) => {
    try {

        // =============================
        // Get Customers
        // =============================
        const [quotations] = await pool.execute(`
            SELECT q.id as q_id, q.title, q.grand_total,  c.name as name , c.id as cus_id 
            FROM quotations q
            JOIN customers c ON q.customer_id = c.id
        `);

        // =============================
        // Get Products
        // =============================
        const [products] = await pool.execute(`
    SELECT 
        p.id AS product_id,
        p.name,
        p.type,
        p.sale_price,

        b.id AS batch_id,
        b.batch_no,
        b.qty_remaining,
        b.cost_price

    FROM products p

    LEFT JOIN inventory_batches b 
        ON b.product_id = p.id

    WHERE
        (
            p.type = 'service'
        )
        OR
        (
            p.type = 'product'
            AND b.qty_remaining > 0
        )

    ORDER BY p.name
`);


        const productOptions = products.map(p => {

            const isService = p.type === 'service';

            return {
                value: JSON.stringify({
                    product_id: p.product_id,

                    batch_id: isService ? null : p.batch_id,

                    sale_price: Number(p.sale_price),

                    cost_price: Number(
                        isService
                            ? (p.cost_price || 0)
                            : p.cost_price
                    ),

                    stock: isService
                        ? null
                        : Number(p.qty_remaining),

                    type: p.type
                }),

                label: isService
                    ? `${p.name} | Service`
                    : `${p.name} | Batch ${p.batch_no} | Stock:${p.qty_remaining} | Cost:${p.cost_price}`
            };
        });

        res.render('sales/add', {
            quotations,
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
    const { data, p_status, o_status, items, date } = req.body;

    if (!data|| !items || !Array.isArray(items) || items.length === 0) {
        return res.redirect('/sales/orders/new?error=Customer and items are required');
    }

    const connection = await pool.getConnection();
    const Data = JSON.parse(data);
    const customer_id = Data.customer_id;
    const quotation_id = Data.quotation_id;
    const grand_Total = Data.grand_total;
    try {
        await connection.beginTransaction();

        // ===============================
        // Create Sales Order Header FIRST
        // ===============================
        const [orderResult] = await connection.query(`
            INSERT INTO sales_orders
            (customer_id, quotation_id, status, progress, profit, date, total_amount, quoted_amount)
            VALUES (?, ?, ?, ?, 0, ?, 0, ?)
        `, [
            customer_id,
            quotation_id,
            p_status || 'pending',
            o_status || 'pending',
            date,
            grand_Total
        ]);

        const sales_order_id = orderResult.insertId;

        // ===============================
        // Calculate Profit + Process Items
        // ===============================
        let total_cost = 0;

        for (const item of items) {
            if (!item.product_data) {
                throw new Error("Product data missing for an item");
            }

            const productData = JSON.parse(item.product_data);
            const product_id = productData.product_id;
            const batch_id = productData.batch_id;
            const quantity = Number(item.quantity);
            // ===============================
            // Validate warranty date
            // ===============================
            const warranty = item.warranty
            ? new Date(item.warranty)
            : new Date().toISOString().split('T')[0];

            if (!quantity) {
                throw new Error("Invalid quantity for product " + product_id);
            }
            const [productRows] = await connection.query(`
            SELECT type, name
            FROM products
            WHERE id = ?
        `, [product_id]);

            if (!productRows.length) {
                throw new Error(`Product ${product_id} not found`);
            }

            const product = productRows[0];

            // ===============================
            // Check batch stock
            // ===============================
            let cost_price = 0;
            if (product.type === 'product') {
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

                cost_price = Number(batch.cost_price);
                total_cost += cost_price * quantity
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
            }
            // ===============================
            // Insert order item
            // ===============================
            await connection.query(`
                INSERT INTO so_items
                (so_id, p_id, batch_id, quantity, cost_price, warranty)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                sales_order_id,
                product_id,
                product.type === 'product' ? batch_id : null,
                quantity,
                cost_price,
                warranty
            ]);
        }
        let total_profit = Number(grand_Total || 0) - total_cost;
        // ===============================
        // Update Sales Order totals
        // ===============================
        await connection.query(`
            UPDATE sales_orders
            SET profit = ?, total_amount = ?
            WHERE id = ?
        `, [
            Number(total_profit).toFixed(2),
            total_cost,
            sales_order_id
        ]);

        await connection.commit();

        return res.redirect('/sales/orders?success=Sales order created successfully');

    } catch (error) {
        await connection.rollback();
        console.error(error.message);
        return res.redirect('/sales/orders?error=' + encodeURIComponent(error.message));
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
            ORDER BY 
            CASE so.progress
                WHEN 'pending' THEN 1
                WHEN 'happening' THEN 2
                WHEN 'halted' THEN 3
                WHEN 'signed off' THEN 4
                ELSE 5
            END;
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
        const [rows] = await pool.execute(
            'SELECT status from sales_orders WHERE id = ?',
            [id]
        )
        if (rows[0].status === 'signed off') {
            return res.redirect('/sales?error=Status cannnot be changed after signed off');
        }

        await pool.execute(
            "UPDATE sales_orders SET status=?, progress= ? WHERE id=?",
            [status, progress, id]
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
                c.address,
                q.title AS title,
                q.id AS q_id,
                q.grand_total AS sale_total
            FROM sales_orders so
            LEFT JOIN customers c ON so.customer_id = c.id
            LEFT JOIN quotations q ON so.quotation_id = q.id
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
                si.quantity AS total_quantity,
                si.cost_price AS cost_price
            FROM so_items si
            JOIN products p 
                ON si.p_id = p.id
            WHERE si.so_id = ?
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
            `SELECT so.*, q.grand_total as quoted_amount
            FROM sales_orders so
            LEFT JOIN quotations q ON so.id = q.id
            WHERE so.id = ? AND so.status = 'pending'`,
            [orderId]
        );

        if (orders.length === 0) {
            return res.redirect('/sales/orders?error=Order cannot be edited');
        }

        const order = orders[0];

        // 2️⃣ Load order items
        const [items] = await pool.execute(
            `SELECT *
            FROM so_items 
            WHERE so_id = ?`,
            [orderId]
        );

        // 3️⃣ Get all product batches with stock
        const [products] = await pool.execute(`
    SELECT 
        p.id AS product_id,
        p.name,
        p.type,
        p.sale_price,
        b.id AS batch_id,
        b.batch_no,
        b.qty_remaining,
        b.cost_price AS cost_price

    FROM products p

    LEFT JOIN inventory_batches b 
        ON b.product_id = p.id

    WHERE
        (
            p.type = 'service'
        )
        OR
        (
            p.type = 'product'
            AND b.qty_remaining > 0
        )

    ORDER BY p.name
`);


        let productOptions = products.map(p => {

            const isService = p.type === 'service';

            return {

                value: JSON.stringify({
                    product_id: p.product_id,
                    batch_id: isService ? null : p.batch_id,
                    sale_price: Number(p.sale_price),
                    cost_price: Number(
                        isService
                            ? (p.cost_price || 0)
                            : p.cost_price
                    ),
                    stock: isService
                        ? null
                        : Number(p.qty_remaining),
                    type: p.type
                }),

                label: isService
                    ? `${p.name} | Service`
                    : `${p.name} | Batch ${p.batch_no} | Stock:${p.qty_remaining} | Cost:${p.cost_price}`,

                // 🔴 REQUIRED FIELDS
                product_id: p.product_id,
                batch_id: isService ? null : p.batch_id,
                type: p.type
            };
        });

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
        const grand_total = Number(req.body.grand_total);
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
            `SELECT p_id, quantity, batch_id, cost_price
             FROM so_items 
             WHERE so_id = ?`,
            [orderId]
        );


        for (const item of oldItems) {

            const [product] = await connection.query(`
        SELECT type
        FROM products
        WHERE id = ?
    `, [item.p_id]);

            if (product[0].type === 'service') {
                continue;
            }

            // Restore stock

            await connection.query(`
        UPDATE inventory_batches
        SET qty_remaining = qty_remaining + ?
        WHERE id = ?
    `, [item.quantity, item.batch_id]);

            // Record movement

            await connection.query(`
        INSERT INTO stock_mov
        (
            product_id,
            batch_id,
            quantity,
            movement_type,
            reference_type,
            reference_id,
            cost_price
        )
        VALUES (?, ?, ?, 'IN', 'Sales_Order Edit', ?, ?)
    `, [
                item.p_id,
                item.batch_id,
                item.quantity,
                orderId,
                item.cost_price
            ]);
        }

        // 3️⃣ Delete previous order items
        await connection.query(
            `DELETE FROM so_items WHERE so_id = ?`,
            [orderId]
        );

        let total_cost = 0;
        // 4️⃣ Insert new items and deduct stock
        for (const item of items) {

            const productData = JSON.parse(item.product_data);

            const product_id = productData.product_id;
            const product_type = productData.type;
            
            const qty = Number(item.quantity);
            const price = Number(item.cost_price);
            total_cost = total_cost + (price * qty);
            const warranty =
                item.warranty ||
                new Date().toISOString().split('T')[0];

            /*
                SERVICE PRODUCT
            */

            if (product_type === 'service') {

                await connection.query(`
            INSERT INTO so_items
            (so_id, p_id, warranty, quantity, cost_price)
            VALUES (?, ?, ?, ?, ?)
        `, [
                    orderId,
                    product_id,
                    warranty,
                    qty,
                    price
                ]);

                continue;
            }

            /*
                STOCK PRODUCT
            */

            const batch_id = productData.batch_id;

            if (!batch_id)
                throw new Error("Batch required for product");

            // Check stock

            const [batch] = await connection.query(`
        SELECT qty_remaining
        FROM inventory_batches
        WHERE id = ?
    `, [batch_id]);

            if (batch.length === 0)
                throw new Error("Batch not found");

            if (batch[0].qty_remaining < qty)
                throw new Error("Not enough stock");

            // Deduct stock

            await connection.query(`
        UPDATE inventory_batches
        SET qty_remaining = qty_remaining - ?
        WHERE id = ?
    `, [qty, batch_id]);

            // Stock movement

            await connection.query(`
        INSERT INTO stock_mov
        (product_id, batch_id, quantity,
         movement_type, reference_type,
         reference_id, cost_price)
        VALUES (?, ?, ?, 'OUT', 'Sales_Order Edit', ?, ?)
    `, [
                product_id,
                batch_id,
                qty,
                orderId,
                price
            ]);

            // Insert item

            await connection.query(`
        INSERT INTO so_items
        (so_id, p_id, batch_id, warranty,
         quantity,cost_price)
        VALUES (?, ?, ?, ?, ?,?)
    `, [
                orderId,
                product_id,
                batch_id,
                warranty,
                qty,
                price
            ]);
        }
        const profit = grand_total - total_cost;
        await connection.query(`
    UPDATE sales_orders
    SET total_amount = ?,
        quoted_amount = ?,
        profit = ?
    WHERE id = ?
`, [total_cost, grand_total, profit, orderId]);
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