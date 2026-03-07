const pool = require("../../config/db");


exports.products = async (req, res) => {
        try {
            const [categories] = await pool.execute('SELECT id, name FROM categories ORDER BY name');
            res.render('inventory/add', { categories, message:null }); // pass categories to template
        } catch (err) {
            console.error('Error fetching categories:', err);
            res.status(500).send('Server error');
        }
};
exports.addProduct = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { name, category_id, sale_price, reorder_level, is_active } = req.body;

        // Basic validation
        if (!name || !category_id ||  !sale_price) {
            return res.status(400).json({
                message: "Name, category, cost price, and sale price are required"
            });
        }

        // Default values
        const reorderLevelValue = reorder_level || 0;
        const isActiveValue = is_active || 'yes';
        // Start transaction
        await connection.beginTransaction();

        // Insert into products
        const [productResult] = await connection.execute(
            `INSERT INTO products (name, category_id, sale_price, reorder_level, is_active)
             VALUES (?, ?, ?,  ?, ?)`,
            [name, category_id, sale_price, reorderLevelValue, isActiveValue]
        );

        // Initialize inventory_level
        await connection.execute(
            `INSERT INTO inventory_level (product_id, quantity) VALUES (?, ?)`,
            [productResult.insertId, 0]
        );

        // Commit transaction
        await connection.commit();
        const [categories] = await pool.execute('SELECT id, name FROM categories ORDER BY name');
        res.render('inventory/add', { categories, message:'Product Added Successfully' });

    } catch (err) {
        // Rollback transaction if any error occurs
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
        return res.redirect('/inventory/add?message=Product name already exists');
    }
        console.error("Error adding product:", err);
        res.status(500).json({
            message: "Database error",
            error: err.message
        });
    } finally {
        connection.release(); // release connection back to pool
    }
};

// Add new category
exports.addCategory = async (req, res) => {
    try {
        const { name } = req.body;

        // Validation
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: "Category name is required" });
        }

        // Insert category
        const [result] = await pool.execute(
            `INSERT INTO categories (name) VALUES (?)`,
            [name.trim()]
        );

        res.status(201).json({
            message: "Category added successfully",
            category_id: result.insertId
        });

    } catch (err) {
        console.error("Error adding category:", err);
        res.status(500).json({
            message: "Database error",
            error: err.message
        });
    }
};

exports.getAllProducts = async (req, res) => {
    try {
        // Fetch products with category name
        const [products] = await pool.execute(`
            SELECT p.id, p.name, p.sale_price, p.reorder_level, p.is_active,
                   c.name AS category_name, q.quantity AS quantity
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN inventory_level q on q.product_id = p.id
            ORDER BY p.id
        `);
        // Optional: success message from query string
        const message = req.query.message || null;

        // Render template and pass products
        res.render('inventory/productsList', { products, message });

    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).send('Server error');
    }
};

exports.editProductForm = async (req, res) => {
    try {
        const productId = req.params.id;

        const [rows] = await pool.execute(
            'SELECT * FROM products WHERE id = ?',
            [productId]
        );

        if (rows.length === 0) {
            return res.status(404).send('Product not found');
        }

        res.render('inventory/edit', {
            product: rows[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

exports.updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const { sale_price } = req.body;

        if (!sale_price || isNaN(sale_price)) {
            return res.status(400).send('Invalid sale price');
        }

        await pool.execute(
            `UPDATE products 
             SET sale_price = ? 
             WHERE id = ?`,
            [parseFloat(sale_price), productId]
        );

        res.redirect('/inventory/allProducts');

    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

exports.listStockMovements = async (req, res) => {
    try {

        const [rows] = await pool.execute(`
            SELECT 
                sm.id,
                sm.product_id,
                p.name AS product_name,
                sm.movement_type,
                sm.quantity,
                sm.cost_price,
                sm.reference_type,
                sm.reference_id,
                sm.date
            FROM stock_mov sm
            JOIN products p ON sm.product_id = p.id
            ORDER BY sm.date DESC
        `);

        res.render('inventory/stock-movements', {
            movements: rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};