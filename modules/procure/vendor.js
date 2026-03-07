const db = require('../../config/db'); // mysql2/promise connection

// Add a new vendor
exports.addVendor = async (req, res) => {
    try {
        const { name, phone, email, address, payment_terms } = req.body;

        // Basic validation
        if (!name || name.trim() === '') {
            return res.redirect('/procure/addVendor?message=Vendor name is required');
        }

        const [result] = await db.execute(
            `INSERT INTO vendors (name, phone, email, address, payment_terms)
             VALUES (?, ?, ?, ?, ?)`,
            [name.trim(), phone || null, email || null, address || null, payment_terms || 'Net 30']
        );

        res.redirect('/procure/addVendor?message=Vendor added successfully');

    } catch (err) {
        console.error('Error adding vendor:', err);

        // Handle duplicate vendor name if you add UNIQUE constraint
        if (err.code === 'ER_DUP_ENTRY') {
            return res.redirect('/procure/addVendor?message=Vendor name already exists');
        }

        res.status(500).send('Server error');
    }
};

// List all vendors
exports.getAllVendors = async (req, res) => {
    try {
        const [vendors] = await db.execute(
            `SELECT * FROM vendors ORDER BY name`
        );

        // Optional message from query string
        const message = req.query.message || null;

        res.render('procure/vendorList', { vendors, message });

    } catch (err) {
        console.error('Error fetching vendors:', err);
        res.status(500).send('Server error');
    }
};