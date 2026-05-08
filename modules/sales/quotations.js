const pool = require('../../config/db');
const PDFDocument = require("pdfkit");

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
        p.type,
        p.sale_price,

        b.id AS batch_id,
        b.batch_no,
        b.qty_remaining,
        b.cost_price

    FROM products p
    LEFT JOIN inventory_batches b 
        ON b.product_id = p.id
    ORDER BY p.name;
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

        res.render('quotations/add', {
            customers,
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
    const { title, customer_id, date, items } = req.body; // items = [{product_id, batch_id, quantity, sale_price, name, category}]
    console.log(customer_id);
    console.log(date)
    console.log(items)
    const published = req.body.published ? 'yes' : 'no';
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();
        // Insert quotation header
        const [quoResult] = await conn.execute(`
            INSERT INTO quotations (title, customer_id, date, grand_total, is_published)
            VALUES (?,?,?, 0, ?)
        `, [title, customer_id, date, published]);

        const qoId = quoResult.insertId;

        let grandTotal = 0;

        for (let item of items) {
            const productData = JSON.parse(item.product_data);
            const product_id = productData.product_id;
            const batch_id = productData.batch_id || null;
            const quantity = Number(item.quantity);
            const salePrice = Number(item.sale_price);
            const costPrice = productData.cost_price;

            // Insert quotation item
            await conn.execute(`
                INSERT INTO qo_items
                (qo_id, product_id, batch_id, quantity, cost_price, sale_price)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [qoId, product_id, batch_id, quantity, costPrice, salePrice]);

            grandTotal += quantity * salePrice;
        }

        // Update quotation totals
        await conn.execute(`
            UPDATE quotations SET grand_total = ? WHERE id = ?
        `, [grandTotal, qoId]);

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
        const [[quotation]] = await pool.execute(`
            SELECT q.*, c.name as name
            FROM quotations q
            JOIN customers c ON q.customer_id = c.id
            WHERE q.id = ?`,
            [quoId]);
        if (!quotation) return res.status(404).send('Quotation not found');

        const [items] = await pool.execute(`
            SELECT q.*, p.name as name FROM qo_items q
            JOIN products p ON q.product_id = p.id
            WHERE qo_id = ?`,
            [quoId]);
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



exports.downloadQuotationPDF = async (req, res) => {
     console.log("PDF route hit");
    const quotationId = req.params.id;

    const [quotation] = await pool.execute(`
        SELECT q.*
        FROM quotations q
        WHERE q.id=?
        `, [quotationId]);

    const [items] = await pool.execute(`
        SELECT qi.*,p.name product_name
        FROM qo_items qi
        LEFT JOIN products p ON qi.product_id=p.id
        WHERE qi.qo_id=?
        `, [quotationId]);

      const q = quotation[0];

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename=quotation-${quotationId}.pdf`
    );

    doc.pipe(res);

    // Header
    doc
        .fontSize(22)
        .text("MAQ ERP", 50, 50)
        .fontSize(10)
        .text("MAQSOLAR", 50, 75)
        .text("Phone: +92 3214776991");

    doc
        .fontSize(20)
        .text("QUOTATION", 400, 50);

    // Customer info
    doc
        .fontSize(12)
        .text(`Quotation #: ${q.id}`,50,130)
        .text(`Date: ${new Date(q.date).toLocaleDateString()}`);

    // Table header
    let tableTop = 200;
    const colProduct = 50;
    const colQty = 300;
    const colPrice = 370;
    const colTotal = 450;
    const tableWidth = 500;

    // Draw dark background
    // Header background
    doc.rect(50, tableTop, tableWidth, 25).fill("#2c3e50");

    // Header text
    doc
    .fillColor("white")
    .fontSize(12)
    .text("Product", colProduct + 5, tableTop + 7)
    .text("Qty", colQty + 5, tableTop + 7)
    .text("Price", colPrice + 5, tableTop + 7)
    .text("Total", colTotal + 5, tableTop + 7);

    doc.fillColor("black");

    // Header border
    doc.rect(50, tableTop, tableWidth, 25).stroke();

    let y = tableTop + 25;

    items.forEach(item => {

        doc.rect(50, y, tableWidth, 25).stroke();

        doc
        .fontSize(10)
        .text(item.product_name, colProduct + 5, y + 7)
        .text(item.quantity, colQty + 5, y + 7)
        .text(Number(item.sale_price).toLocaleString(), colPrice + 5, y + 7)
        .text(Number(item.sale_price * item.quantity).toLocaleString(), colTotal + 5, y + 7);

        y += 25;
    });

    // Total
    doc.moveDown(2);

    doc
        .fontSize(12)
        .text(
            `Total: ${Number(q.grand_total).toLocaleString()}`,
            450,
            y + 20
        );

    // Footer
    doc
        .fontSize(10)
        .text(
            "Thank you for your business!",
            50,
            700,
            { align: "center", width: 500 }
        );

    doc.end();
}