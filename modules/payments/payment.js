const pool = require('../../config/db');


exports.showPaymentForm = async (req,res)=>{
    try{
        const [sales] = await pool.execute(
            "SELECT id  FROM sales_orders WHERE status IN ('pending','payment pending') ORDER BY id DESC"
        );

        const [purchases] = await pool.execute(
            "SELECT id FROM purchase_orders WHERE status IN ('Pending','Received') ORDER BY id DESC"
        );

        const [expenses] = await pool.execute(
            "SELECT id, title FROM expenses WHERE status='UNPAID' ORDER BY id DESC"
        );

        const [accounts] = await pool.execute(
            "SELECT id,name FROM accounts"
        );

        res.render('payments/add',{
            sales,
            purchases,
            expenses,
            accounts,
            success:req.query.success,
            error:req.query.error
        });

    }catch(err){
        console.error(err);
        res.send("Error loading payment form");
    }
};

exports.createPayment = async (req, res) => {
    const conn = await pool.getConnection();

    try {
        const {
            payment_type,     // sale/purchase/expense/transfer
            from_account_id,  // account giving money
            to_account_id,    // account receiving money
            amount,
            payment_date,
            notes
        } = req.body;

        if (!payment_type || !from_account_id || !to_account_id || !amount) {
            return res.redirect('/payments/add?error=Missing required fields');
        }
        const to_account = parseInt(to_account_id)
        const from_account = parseInt(from_account_id);

        await conn.beginTransaction();

        // 1️⃣ Insert Payment Record
        const [payment] = await conn.execute(
            `INSERT INTO payments
            (payment_type, account_id, amount, payment_date, reference)
            VALUES (?, ?, ?, ?, ?)`,
            [
                payment_type,
                from_account,    // for reference, main account
                amount,
                payment_date,
                notes || `From Account ${from_account_id} → To Account ${to_account_id}`
            ]
        );

        const paymentId = payment.insertId;

        // 2️⃣ Create Journal
        const [journal] = await conn.execute(
            `INSERT INTO journal
            (date, reference_type, reference_id, name)
            VALUES (?, ?, ?, ?)`,
            [payment_date, payment_type, paymentId, 'Payment Transaction']
        );
        const journalId = journal.insertId;

        // 3️⃣ Journal Entries
        // Debit: destination account (money received)
        await conn.execute(
            `INSERT INTO journal_entries
            (journal_id, account_id, debit, credit)
            VALUES (?,?,?,?)`,
            [journalId, to_account, amount, 0]
        );

        // Credit: source account (money spent)
        await conn.execute(
            `INSERT INTO journal_entries
            (journal_id, account_id, debit, credit)
            VALUES (?,?,?,?)`,
            [journalId, from_account, 0, amount]
        );

        await conn.commit();
        res.redirect('/payments/add?success=Payment created');

    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.redirect('/payments/add?error=' + encodeURIComponent(err.message));
    } finally {
        conn.release();
    }
};

exports.listPayments = async (req, res) => {
    try {

        const [payments] = await pool.execute(
            `SELECT 
                p.id,
                p.payment_type,
                p.reference_id,
                p.amount,
                p.payment_date,
                p.reference,
                a.name AS account_name
            FROM payments p
            LEFT JOIN accounts a ON p.account_id = a.id
            ORDER BY p.payment_date DESC`
        );

        res.render('payments/list', {
            payments
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

