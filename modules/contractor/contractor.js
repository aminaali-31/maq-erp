const pool = require('../../config/db');


// =============================
// View All Contractors
// =============================
exports.viewContractors = async (req, res) => {
    try {
        const [contractors] = await pool.execute(
            `SELECT 
                id,
                name,
                phone
             FROM contractors
             ORDER BY name ASC`
        );

        res.render('contractors/all', {
            contractors,
            success: req.query.success,
            error: req.query.error
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading contractors");
    }
};



// =============================
// Show Add Contractor Form
// =============================
exports.showAddContractor = (req, res) => {
    res.render('contractors/add', {
        success: req.query.success,
        error: req.query.error});
};



// =============================
// Create Contractor
// =============================
exports.createContractor = async (req, res) => {
    try {
        const { name, phone } = req.body;

        // Basic validation
        if (!name || !phone) {
            return res.redirect('/contractors/add?error=All fields are required');
        }

        const [result] = await pool.execute(
            `INSERT INTO contractors
             (name, phone)
             VALUES (?, ?)`,
            [name, phone]
        );

         const id = result.insertId;

        // 2️⃣ Auto-create Account for Customer
        const accountName = `${name}`;
        const [accountResult] = await pool.execute(
            `INSERT INTO accounts (name, type)
             VALUES (?, ?)`,
            [accountName, 'liability']
        );

        const accountId = accountResult.insertId;

        // 3️⃣ Link Account to Customer
        await pool.execute(
            `UPDATE contractors SET account_id=? WHERE id=?`,
            [accountId, id]
        );

        res.redirect('/contractors/all?success=Contractor created');

    } catch (err) {
        console.error(err);
        res.redirect('/contractors/add?error=Failed to create contractor');
    }
};


// List all contracts
exports.listContracts = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const [contracts] = await conn.execute(
            `SELECT c.id, c.name, c.date, c.amount,
                    co.name AS co_name
             FROM contracts c
             LEFT JOIN contractors co ON c.contractor_id = co.id
             ORDER BY c.date DESC`
        );

        res.render('contractors/allContracts', { contracts }); // render with your template
        // OR for API:
        // res.json({ success: true, data: contracts });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error while fetching contracts');
    } finally {
        conn.release();
    }
};

exports.showAddContractForm = async (req, res) => {
    try {
        // Get all contractors
        const [contractors] = await pool.execute(
            `SELECT 
                id,
                name
             FROM contractors
             ORDER BY name ASC`
        );

        res.render('contractors/addContract', {
            contractors,
            message: req.query.message,
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading contract form");
    }
};

exports.createContract = async (req, res) => {
    const conn = await pool.getConnection();

    try {
        const {
            contractor_id,
            name,
            description,
            amount,
            date,
        } = req.body;

        if (!contractor_id || !name || !amount) {
            return res.redirect('/contractors/addContract?message=Missing required fields');
        }

        await conn.beginTransaction();

        // 1️⃣ Get Contractor Account
        const [contractorRows] = await conn.execute(
            `SELECT account_id
             FROM contractors
             WHERE id = ?`,
            [contractor_id]
        );

        if (!contractorRows.length) {
            throw new Error('Contractor not found');
        }

        const contractorAccountId = contractorRows[0].account_id;

        if (!contractorAccountId) {
            throw new Error('Contractor account not linked');
        }

        // 2️⃣ Insert Contract
        const [contractResult] = await conn.execute(
            `INSERT INTO contracts
            (contractor_id, name, description, amount,date)
            VALUES (?, ?, ?, ?, ?)`,
            [
                contractor_id,
                name,
                description,
                amount,
                date
            ]
        );

        const contractId = contractResult.insertId;

        // 3️⃣ Get Payables Account
        const [payableRows] = await conn.execute(
            `SELECT id
             FROM accounts
             WHERE name = 'Order Expenses' `
        );

        if (!payableRows.length) {
            throw new Error('Payables account not found');
        }

        const payableAccountId = payableRows[0].id;

        // 4️⃣ Create Journal
        const [journalResult] = await conn.execute(
            `INSERT INTO journal
            (date, reference_type, reference_id, name)
            VALUES (CURDATE(), 'CONTRACT', ?, ?)`,
            [
                contractId,
                `Contract Created: ${name}`
            ]
        );

        const journalId = journalResult.insertId;

        // 5️⃣ Debit Contractor Account
        await conn.execute(
            `INSERT INTO journal_entries
            (journal_id, account_id, debit, credit)
            VALUES (?, ?, ?, ?)`,
            [
                journalId,
                contractorAccountId,
                amount,
                0
            ]
        );

        // 6️⃣ Credit Payables
        await conn.execute(
            `INSERT INTO journal_entries
            (journal_id, account_id, debit, credit)
            VALUES (?, ?, ?, ?)`,
            [
                journalId,
                payableAccountId,
                0,
                amount
            ]
        );

        await conn.commit();

        res.redirect('/contractors/allContracts?message=Contract created');

    } catch (err) {
        await conn.rollback();
        console.error(err);

        res.redirect(
            '/contractors/addContract?message=' +
            encodeURIComponent(err.message)
        );
    } finally {
        conn.release();
    }
};


exports.viewContract = async (req, res) => {
    const contractId = req.params.id;
    try {
        const [contracts] = await pool.execute(
            `SELECT * , c.name as contractor_name FROM contracts as co
             JOIN contractors as c ON c.id = co.contractor_id
              WHERE co.id = ?`,
             [contractId]);
        if (!contracts.length) return res.status(404).send('Contract not found');
        res.render('contractors/view', { contract: contracts[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching contract');
    }
};