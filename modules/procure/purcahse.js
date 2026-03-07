const db = require('../../config/db'); // mysql2/promise connection

// Show add purchase order page
exports.showAddPOForm = async (req, res) => {
    
    try {
        // Fetch all products to display in the form
        const [products] = await db.execute('SELECT id, name FROM products WHERE is_active = "yes" ORDER BY name');
        const [vendors] = await db.execute("SELECT id, name FROM vendors")
        const message = req.query.message || null;

        res.render('procure/addPurchase', { products, vendors, message });
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).send('Server error');
    }
};

// Account mapping (CHANGE THESE according to your database)
const INVENTORY_ACCOUNT_ID = 6;
const PAYABLE_ACCOUNT_ID = 2;

// Add a new purchase order with items + journal entries
exports.addPurchaseOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { vendor_id, po_date, total_amount, items } = req.body;

        if (!vendor_id || !items || !Array.isArray(items) || items.length === 0) {
            return res.redirect('/procure/purchase-orders/add?message=Vendor and items are required');
        }

        await connection.beginTransaction();

        // ✅ 1. Insert Purchase Order
        const [poResult] = await connection.execute(
            `INSERT INTO purchase_orders (vendor_id, order_date, status, total_amount)
             VALUES (?, ?, ?, ?)`,
            [vendor_id, po_date || new Date(), 'Pending', total_amount]
        );

        const poId = poResult.insertId;
                // Create Journal Header
        const [journalResult] = await connection.execute(
            `INSERT INTO journal 
            (reference_type, reference_id,name,date)
            VALUES (?, ?, ?, NOW())`,
            [
                'PURCHASE_ORDER',
                poId,
                `Purchase Order #${poId}`,
            ]
        );

        const journalId = journalResult.insertId;

        let calculatedTotal = 0;

        // ✅ 2. Insert Items + Stock Movement
        for (let item of items) {

            const [productRows] = await connection.execute(
                'SELECT id FROM products WHERE id = ?',
                [item.product_id]
            );

            if (productRows.length === 0) {
                throw new Error(`Product ID ${item.product_id} does not exist`);
            }

            const quantity = parseInt(item.quantity);
            const unit_price = parseFloat(item.unit_price);
            const total = quantity * unit_price;

            calculatedTotal += total;

            // Insert PO Items
            await connection.execute(
                `INSERT INTO po_items (po_id, product_id, quantity, unit_price, total)
                 VALUES (?, ?, ?, ?, ?)`,
                [poId, item.product_id, quantity, unit_price, total]
            );

            // Stock IN movement
            await connection.execute(
                `INSERT INTO stock_mov 
                 (product_id, movement_type, quantity, cost_price, reference_type, reference_id)
                 VALUES (?, 'IN', ?, ?, 'PURCHASE_ORDER', ?)`,
                [item.product_id, quantity, unit_price, poId]
            );
        }

        // ✅ 3. Add Journal Entries (DOUBLE ENTRY)

        // Debit Inventory
        await connection.execute(
            `INSERT INTO journal_entries 
            (journal_id,account_id, debit, credit)
            VALUES (?,?, ?, 0)`,
            [
                journalId,
                INVENTORY_ACCOUNT_ID,
                calculatedTotal,
            ]
        );

        // Credit Accounts Payable
        await connection.execute(
            `INSERT INTO journal_entries 
            (journal_id,account_id, debit, credit)
            VALUES (?,?, 0, ?)`,
            [
                journalId,
                PAYABLE_ACCOUNT_ID,
                calculatedTotal,
            ]
        );

        await connection.commit();

        res.redirect(`/procure/purchase-orders/add?message=Purchase Order added successfully`);

    } catch (err) {
        await connection.rollback();
        console.error('Error adding purchase order:', err);
        res.status(500).send('Server error');
    } finally {
        connection.release();
    }
};


// List all purchase orders
exports.listAllPOs = async (req, res) => {
    try {
        // Get all POs with vendor name and total amount
        const [pos] = await db.execute(`
            SELECT po.id, po.order_date, po.status, v.name AS vendor_name,
                   IFNULL(SUM(pi.total), 0) AS total_amount
            FROM purchase_orders po
            JOIN vendors v ON po.vendor_id = v.id
            LEFT JOIN po_items pi ON pi.po_id = po.id
            GROUP BY po.id
            ORDER BY po.order_date DESC
        `);

        const message = req.query.message || null;

        res.render('procure/listPurchaseOrders', { pos, message });
    } catch (err) {
        console.error('Error fetching purchase orders:', err);
        res.status(500).send('Server error');
    }
};
exports.viewPO = async (req, res) => {
    try {
        const poId = req.params.id;

        // Get PO info
        const [[po]] = await db.execute(`
            SELECT po.id, po.order_date, po.status, v.name AS vendor_name
            FROM purchase_orders po
            JOIN vendors v ON po.vendor_id = v.id
            WHERE po.id = ?
        `, [poId]);

        if (!po) {
            return res.redirect('/procure/purchase-orders/all?message=Purchase Order not found');
        }

        // Get PO items
        const [items] = await db.execute(`
            SELECT pi.quantity, pi.unit_price, pi.total, p.name AS product_name
            FROM po_items pi
            JOIN products p ON pi.product_id = p.id
            WHERE pi.po_id = ?
        `, [poId]);

        res.render('procure/viewPurchaseOrder', { po, items });
    } catch (err) {
        console.error('Error fetching purchase order:', err);
        res.status(500).send('Server error');
    }
};

exports.changePOStatus = async (req, res) => {
    const connection = await db.getConnection();

    try {

        const poId = req.params.id;
        const status = req.query.status;

        const allowedStatuses = ['Pending','Received','Paid'];

        if (!allowedStatuses.includes(status)) {
            return res.redirect('/procure/purchase-orders/all?message=Invalid status');
        }

        await connection.beginTransaction();

        await connection.execute(
            `UPDATE purchase_orders 
             SET status = ?
             WHERE id = ?`,
            [status, poId]
        );

        await connection.commit();

        res.redirect('/procure/purchase-orders/all?message=Status updated');

    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('Server error');
    } finally {
        connection.release();
    }
};