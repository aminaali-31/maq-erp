const db = require('../../config/db'); // mysql2/promise connection

// Show add purchase order page
exports.showAddPOForm = async (req, res) => {
    
    try {
        // Fetch all products to display in the form
        const [products] = await db.execute('SELECT id, name FROM products WHERE is_active = "yes" ORDER BY name');
        const [vendors] = await db.execute("SELECT id, name FROM vendors")
        const message = req.query.message || null;

        res.render('procure/addPurchase', { products, vendors, message: req.query.message});
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
    const conn = await db.getConnection();

    try {
        const { vendor_id, po_date, total_amount, items } = req.body;

        if (!vendor_id || !items || !Array.isArray(items) || items.length === 0) {
            return res.redirect('/procure/purchase-orders/add?message=Vendor and items are required');
        }

        await conn.beginTransaction();

         // 1️⃣ Insert Purchase Order
        const [poResult] = await conn.execute(
            `INSERT INTO purchase_orders (vendor_id, order_date, status, total_amount)
            VALUES (?, ?, ?, ?)`,
            [vendor_id, po_date || new Date(), 'Pending', total_amount]
        );
        const poId = poResult.insertId;

        // 2️⃣ Create Journal Header
        const [journalResult] = await conn.execute(
            `INSERT INTO journal 
            (reference_type, reference_id,name,date)
            VALUES (?, ?, ?, NOW())`,
            ['PURCHASE_ORDER', poId, `Purchase Order #${poId}`]
        );
        const journalId = journalResult.insertId;

        // 3️⃣ Fetch Vendor Account
        const [vendorRows] = await conn.execute(
            `SELECT account_id FROM vendors WHERE id=?`,
            [vendor_id]
        );
        if (!vendorRows[0]) throw new Error('Vendor account not found');
        const VENDOR_ACCOUNT_ID = vendorRows[0].account_id;

        // 4️⃣ Set Inventory / Expense account
        const INVENTORY_ACCOUNT_ID = 5; // replace with your actual inventory/asset account

        let calculatedTotal = 0;

        // 5️⃣ Insert Items + Stock + calculate total
        for (let item of items) {
            const quantity = parseInt(item.quantity);
            const unit_price = parseFloat(item.unit_price);
            const total = quantity * unit_price;
            calculatedTotal += total;

            // Insert PO Items
            await conn.execute(
                `INSERT INTO po_items (po_id, product_id, quantity, unit_price, total)
                VALUES (?, ?, ?, ?, ?)`,
                [poId, item.product_id, quantity, unit_price, total]
            );

            // Insert Inventory Batch
            const batchNo = item.batch_no
                ? parseInt(item.batch_no)
                : Math.floor(Math.random() * 900) + 10;

            await conn.execute(
                `INSERT INTO inventory_batches
                (product_id, batch_no, qty_received, qty_remaining, cost_price)
                VALUES (?, ?, ?, ?, ?)`,
                [item.product_id, batchNo, quantity, quantity, unit_price]
            );
        }

        // 6️⃣ Insert Journal Entries
        // Debit Inventory / Expense (assets increase)
        await conn.execute(
            `INSERT INTO journal_entries
            (journal_id, account_id, debit, credit)
            VALUES (?, ?, ?, ?)`,
            [journalId, INVENTORY_ACCOUNT_ID, calculatedTotal, 0]
        );

        // Credit Vendor Account (liabilities increase)
        await conn.execute(
            `INSERT INTO journal_entries
            (journal_id, account_id, debit, credit)
            VALUES (?, ?, ?, ?)`,
            [journalId, VENDOR_ACCOUNT_ID, 0, calculatedTotal]
        );

        await conn.commit();
        res.redirect('/procure/purchase-orders/add?message=Purchase order created');

    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.redirect('/procure/purchase-orders/add?message=' + encodeURIComponent(err.message));
    } finally {
        conn.release();
}

}
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

// controllers/purchaseOrderController.js
exports.editPendingPOForm = async (req, res) => {
    try {
        const poId = req.params.id;

        // 1️⃣ Fetch the purchase order
        const [poRows] = await db.execute(`
            SELECT po.*, s.name AS supplier_name
            FROM purchase_orders po
            LEFT JOIN vendors s ON po.vendor_id = s.id
            WHERE po.id = ? AND po.status = 'pending'
        `, [poId]);

        if (!poRows.length) {
            return res.redirect('/purchase/orders?error=Purchase order not found or not pending');
        }

        const po = poRows[0];

        // 2️⃣ Fetch the items
        const [items] = await db.execute(`
            SELECT pi.*, p.name AS product_name
            FROM po_items pi
            JOIN products p ON pi.product_id = p.id
            WHERE pi.po_id = ?
        `, [poId]);

        res.render('procure/edit', { po, items });

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Controller to handle update
exports.updatePendingPO = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const poId = req.params.id;
        const { items } = req.body; // items = [{po_item_id, cost_price}]

        if (!items || !Array.isArray(items) || !items.length) {
            throw new Error('No items provided');
        }

        let totalAmount = 0;

        for (const item of items) {
            const poItemId = item.po_item_id;
            const costPrice = parseFloat(item.unit_price);

            if (isNaN(costPrice) || costPrice < 0) {
                throw new Error(`Invalid price for item ID ${poItemId}`);
            }

            // Update item price
            await connection.query(`
                UPDATE po_items
                SET unit_price = ?
                WHERE id = ?
            `, [costPrice, poItemId]);

            // Recalculate total
            const [[row]] = await connection.query(`
                SELECT quantity FROM po_items WHERE id = ?
            `, [poItemId]);

            totalAmount += row.quantity * costPrice;
        }

        // Update PO total
        await connection.query(`
            UPDATE purchase_orders
            SET total_amount = ?
            WHERE id = ?
        `, [totalAmount, poId]);

        await connection.commit();

        res.redirect(`/procure/orders/edit/${poId}?success=PO updated successfully`);

    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.redirect(`/procure/orders/edit/${req.params.id}?error=${encodeURIComponent(err.message)}`);
    } finally {
        connection.release();
    }
};