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
                name: p.name,
                stock: Number(p.qty_remaining)
            }),
            label: `${p.name} | Batch ${p.batch_no} | Stock:${p.qty_remaining} |  Cost:${p.cost_price}`
        }));

        res.render('quotations/add', {
            productOptions,
            success: req.query.success,
            error: req.query.error
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Create Quotation with batch-aware cost
exports.createQuotation = async (req, res) => {
    const { title, items } = req.body; // items = [{product_id, batch_id, quantity, sale_price, name, category}]
    const published = req.body.published ? 'yes' : 'no';
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // Insert quotation header
        const [quoResult] = await conn.execute(`
            INSERT INTO quotations (title, grand_total, margin, profit, is_published)
            VALUES (?, 0, 0, 0, ?)
        `, [title, published]);

        const qoId = quoResult.insertId;

        let grandTotal = 0;
        let totalCost = 0;

        for (let item of items) {
            const productData = JSON.parse(item.product_data);
            console.log(productData);
            const product_id = productData.product_id;
            const batch_id = productData.batch_id;
            const quantity = Number(item.quantity);
            const salePrice = Number(item.sale_price);
            const name = productData.name
            const category = productData.category || null;
            const costPrice = productData.cost_price;

            // Insert quotation item
            await conn.execute(`
                INSERT INTO qo_items
                (qo_id, product_id, batch_id, quantity, name, category, cost_price, sale_price)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [qoId, product_id, batch_id, quantity, name, category, costPrice, salePrice]);

            grandTotal += quantity * salePrice;
            totalCost += quantity * costPrice;
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

exports.publishedQuotations = async () => {
    try {

        const [quotes] = await pool.query(`
            SELECT id, title , grand_total , date
            FROM quotations
            WHERE is_published = 'yes'
            ORDER BY date DESC
        `);

        return quotes

    } catch (err) {
        console.error(err);
        return [];
    }
};

exports.viewClientQuotation = async (req, res) => {
    try {

        const quotationId = req.params.id;

        // get quotation
        const [quotationRows] = await pool.execute(`
            SELECT *
            FROM quotations
            WHERE id = ?
        `, [quotationId]);

        if (quotationRows.length === 0) {
            return res.status(404).send("Quotation not found");
        }

        const quotation = quotationRows[0];

        // get quotation items
        const [items] = await pool.execute(`
            SELECT
                q.id,
                p.name,
                q.quantity,
                q.sale_price
            FROM qo_items AS q
            JOIN products AS p ON q.product_id = p.id
            WHERE qo_id = ?
        `, [quotationId]);

        res.render('quotations/quotation-view', {
            quotation,
            items
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};