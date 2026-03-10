const db = require('../../config/db'); // mysql2/promise connection
const bcrypt = require('bcrypt');

// Add a new vendor
exports.addVendor = async (req, res) => {
    const conn = await db.getConnection();

    try {
        const { name, password, phone, email, address, payment_terms } = req.body;
        // Basic validation
        if (!name || name.trim() === '' ||  !password || !email) {
            return res.redirect('/procure/addVendor?message=Vendor name and password are required');
        }
        const hashedPassword = await bcrypt.hash(password, 12);

        await conn.beginTransaction();

        const [result] = await conn.execute(
            `INSERT INTO vendors (name, password,  phone, email, address, payment_terms)
             VALUES (?, ?,?, ?, ?, ?)`,
            [name.trim(), hashedPassword, phone || null, email, address || null, payment_terms || 'Net 30']
        );

         const venId = result.insertId;

        // 2️⃣ Auto-create Account for vendor
        const accountName = `${name}`;
        const [accountResult] = await conn.execute(
            `INSERT INTO accounts (name, type)
             VALUES (?, ?)`,
            [accountName, 'liability']
        );

        const accountId = accountResult.insertId;

        // 3️⃣ Link Account to vendors
        await conn.execute(
            `UPDATE vendors SET account_id=? WHERE id=?`,
            [accountId, venId]
        );

        await conn.execute(
            `INSERT INTO users (username, password, email, role_id, vendor_id, customer_id, status)
            VALUES (?, ?, ?, 7, ?, NULL, 'active')`,
            [name, hashedPassword, email, venId]
        );

        await conn.commit(); // commit transaction
        res.redirect('/procure/addVendor?message=Vendor added successfully');

    } catch (err) {
        await conn.rollback();
        console.error('Error adding vendor:', err);
        // Handle duplicate vendor name if you add UNIQUE constraint
        if (err.code === 'ER_DUP_ENTRY') {
            return res.redirect('/procure/addVendor?message=Vendor name or email already exists');
        }

        res.status(500).send('Server error');
    } finally {
        conn.release();
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