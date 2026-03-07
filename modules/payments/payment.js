const pool = require('../../config/db');

exports.showPaymentForm = async (req,res)=>{
    try{

        const [sales] = await pool.execute(
            "SELECT id FROM sales_orders WHERE status = 'pending' OR status = 'payment pending' ORDER BY id DESC"
        );

        const [purchases] = await pool.execute(
            "SELECT id FROM purchase_orders WHERE status = 'Pending' OR status = 'Received' ORDER BY id DESC"
        );

        const [accounts] = await pool.execute(
            "SELECT id,name FROM accounts"
        );

        res.render('payments/add',{
            sales,
            purchases,
            accounts,
            success:req.query.success,
            error:req.query.error
        });

    }catch(err){
        console.error(err);
        res.status(500).send("Server Error");
    }
};


exports.createPayment = async (req, res) => {

    const conn = await pool.getConnection();

    try {

        const {
            payment_type,
            reference_id,
            account_id,
            amount,
            payment_date,
            notes
        } = req.body;

        let reference = parseInt(reference_id);
        let account = parseInt(account_id);
        if (!payment_type || !account_id || !amount) {
            return res.redirect('/payments/add?error=Missing required fields');
        }

        await conn.beginTransaction();

        // 1️⃣ Save Payment
        const [payment] = await conn.execute(
            `INSERT INTO payments
            (payment_type, reference_id, account_id, amount, payment_date)
            VALUES (?,?,?,?,?)`,
            [payment_type, reference || null, account, amount, payment_date]
        );

        const paymentId = payment.insertId;

        // 2️⃣ Create Journal
        const [journal] = await conn.execute(
            `INSERT INTO journal
            (date, reference_type, reference_id, name)
            VALUES (?,?,?,?)`,
            [payment_date, payment_type, paymentId, 'Payment Transaction']
        );

        const journalId = journal.insertId;

        let debitAccount;
        let creditAccount;

        // 3️⃣ Determine Accounts
        if (payment_type === 'sale') {

            debitAccount = account; // cash/bank
            creditAccount = 3; // accounts receivable

        }

        else if (payment_type === 'purchase') {

            debitAccount = 2; // accounts payable
            creditAccount = account; // cash/bank

        }

        else if (payment_type === 'expense') {

            debitAccount = 5; // expense account
            creditAccount = account; // cash/bank

        }

        // 4️⃣ Insert Journal Entries

        await conn.execute(
            `INSERT INTO journal_entries
            (journal_id, account_id, debit, credit)
            VALUES (?,?,?,?)`,
            [journalId, debitAccount, amount, 0]
        );

        await conn.execute(
            `INSERT INTO journal_entries
            (journal_id, account_id, debit, credit)
            VALUES (?,?,?,?)`,
            [journalId, creditAccount, 0, amount]
        );

        await conn.commit();

        res.redirect('/payments/add?success=Payment created');

    } catch (err) {

        await conn.rollback();
        console.error(err);
        res.redirect('/payments/add?error=Database error');

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

