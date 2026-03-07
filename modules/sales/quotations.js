const pool= require('../../config/db');

// Helper: FIFO cost calculation
async function getCostPriceFIFO(productId, quantityNeeded) {
    // Get IN stock movements with remaining_qty > 0, oldest first
    const [rows] = await pool.execute(`
        SELECT id, quantity, cost_price
        FROM stock_mov
        WHERE product_id = ? AND movement_type = 'IN' AND quantity > 0
        ORDER BY date ASC
    `, [productId]);

    let qtyLeft = quantityNeeded;
    let totalCost = 0;

    for (let row of rows) {
        const useQty = Math.min(row.quantity, qtyLeft);
        totalCost += useQty * row.cost_price;
        qtyLeft -= useQty;
        if (qtyLeft <= 0) break;
    }

    if (qtyLeft > 0) {
        throw new Error(`Not enough stock to calculate cost for product ${productId}`);
    }
    console.log(totalCost / quantityNeeded);
    return totalCost / quantityNeeded; // weighted average for this sale quantity
}

// List all quotations
exports.listQuotations = async (req, res) => {
    try {
        const [quotations] = await pool.execute(`
            SELECT * FROM quotations ORDER BY date DESC
        `);
        res.render('quotations/list', { quotations });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Show Add Quotation Form
exports.addQuotationForm = async (req, res) => {
    try {
        const [products] = await pool.execute('SELECT * FROM products');
        res.render('quotations/add', { products });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Create Quotation with FIFO cost calculation and profit
exports.createQuotation = async (req, res) => {
    const { title, items } = req.body; // items = [{product_id, quantity, sale_price}]
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // Insert quotation header
        const [quoResult] = await conn.execute(`
            INSERT INTO quotations (title, grand_total, margin, profit)
            VALUES (?, 0, 0, 0)
        `, [title]);

        const qoId = quoResult.insertId;

        let grandTotal = 0;
        let totalCost = 0;
        console.log("Items received from form:", items);
        // Insert each item
        for (let item of items) {
            const quantity = parseInt(item.quantity);
            const salePrice = parseFloat(item.sale_price);
            const category_id = parseInt(item.category_id)
            // Get cost price using FIFO
            const costPrice = await getCostPriceFIFO(item.product_id, quantity);

            // Calculate total & profit
            const totalItem = quantity * salePrice;
            const profitItem = (salePrice - costPrice) * quantity;

            grandTotal += totalItem;
            totalCost += costPrice * quantity;

            const [rows] = await conn.execute("SELECT name FROM categories WHERE id = ?", [category_id]);
            const categoryName = rows.length ? rows[0].name : null; // fallback if category not found
            // Insert into qo_items
            await conn.execute(`
                INSERT INTO qo_items 
                (qo_id, product_id, quantity, name, category, cost_price, sale_price)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [qoId, item.product_id, quantity, item.name, categoryName, costPrice, salePrice]);
        }

        const margin = grandTotal > 0 ? ((grandTotal - totalCost) / grandTotal) * 100 : 0;
        const profit = grandTotal - totalCost;

        // Update quotation totals
        await conn.execute(`
            UPDATE quotations SET grand_total = ?, margin = ?, profit = ? WHERE id = ?
        `, [grandTotal, margin, profit, qoId]);

        await conn.commit();
        res.redirect(`/sales/quotations/${qoId}`);

    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).send(err.message);
    } finally {
        conn.release();
    }
};

// View single quotation
exports.viewQuotation = async (req, res) => {
    try {
        const quoId = req.params.id;
        const [[quotation]] = await pool.execute('SELECT * FROM quotations WHERE id = ?', [quoId]);
        if (!quotation) return res.status(404).send('Quotation not found');

        const [items] = await pool.execute('SELECT * FROM qo_items WHERE qo_id = ?', [quoId]);
        res.render('quotations/view', { quotation, items });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};