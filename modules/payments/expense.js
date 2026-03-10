const pool = require('../../config/db');


exports.showExpenseForm = async (req,res) => {
    try {
        const [accounts] = await pool.execute(`
            SELECT * FROM accounts`)

        res.render('payments/addExpense', {accounts, success:req.query.success, error:req.query.error});
    } catch (e) {
        res.status(500).send("Database Error")
    }
}
exports.addExpense = async (req, res) => {

    const connection = await pool.getConnection();

    try {

        const { title, amount, account, expense_date} = req.body;

        await connection.beginTransaction();
        const account_id = parseInt(account)
        // 1️⃣ Insert expense
        const [expenseResult] = await connection.query(
            `INSERT INTO expenses (title, amount, expense_date, status)
             VALUES (?, ?, ?, 'PAID')`,
            [title, amount, expense_date ]
        );

        const expense_id = expenseResult.insertId;

        // 2️⃣ Create journal
        const [journalResult] = await connection.query(
            `INSERT INTO journal (reference_type, reference_id, date, name)
             VALUES ('expense', ?, ?, ?)`,
            [expense_id, expense_date, 'Expense']
        );

        const journal_id = journalResult.insertId;

        // 3️⃣ Debit expense account
        await connection.query(
            `INSERT INTO journal_entries (journal_id, account_id, debit, credit)
             VALUES (?, 5, ?, 0)`,
            [journal_id, amount]
        );

        // 4️⃣ Credit accounts payable
        await connection.query(
            `INSERT INTO journal_entries (journal_id, account_id, debit, credit)
             VALUES (?, ?, 0, ?)`,
            [journal_id, account_id, amount]
        );

        await connection.commit();

        res.redirect('/accounts/expenses/add?success=Expense added successfully');

    } catch (error) {

        await connection.rollback();
        console.error(error);

        res.redirect('/accounts/expenses/add?error=Unable to add expense');

    } finally {

        connection.release();

    }
};


exports.listExpenses = async (req, res) => {

    try {

        const [expenses] = await pool.query(`
            SELECT 
                expenses.id,
                expenses.title,
                expenses.amount,
                expenses.expense_date,
                expenses.status
            FROM expenses
            ORDER BY expenses.expense_date DESC
        `);

        res.render('payments/expneseList', { expenses });

    } catch (error) {

        console.error(error);
        res.send("Error loading expenses");

    }

};
