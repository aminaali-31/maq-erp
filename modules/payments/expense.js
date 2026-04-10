const pool = require('../../config/db');


exports.showExpenseForm = async (req, res) => {
    try {
        const [accounts] = await pool.execute(`
            SELECT * FROM accounts`);

        const [orders] = await pool.execute(
            `SELECT * FROM sales_orders`
        );

        res.render('payments/addExpense', { accounts, orders, success: req.query.success, error: req.query.error });
    } catch (e) {
        res.status(500).send("Database Error")
    }
}
exports.addExpense = async (req, res) => {

    const connection = await pool.getConnection();

    try {

        const { title, amount, account, expense_date, type, order_id } = req.body;

        await connection.beginTransaction();
        const account_id = parseInt(account)
        let expenseResult;
        let expense_acc;
        if (type == 'order') {
            [expenseResult] = await connection.query(
                `INSERT INTO expenses (title, amount, expense_date, status, type, sale_order_id)
             VALUES (?, ?, ?, 'PAID', ?, ?)`,
                [title, amount, expense_date, type, order_id]
            );
            const [rows] = await pool.execute(
                `SELECT id FROM accounts WHERE name = 'Order Expenses'`
            );
            expense_acc = rows[0].id;
        } else {
            // 1️⃣ Insert expense
            [expenseResult] = await connection.query(
                `INSERT INTO expenses (title, amount, expense_date, status,type)
             VALUES (?, ?, ?, 'PAID', ?)`,
                [title, amount, expense_date, type]
            );
            const [rows] = await pool.execute(
                `SELECT id FROM accounts WHERE name = 'expense'`
            );
            expense_acc = rows[0].id;
        }

        const expense_id = expenseResult.insertId;
        if (type === 'order') {
            await connection.query(
                `UPDATE sales_orders
                SET profit = profit - ?
                WHERE id = ?`,
                [amount, order_id]
            );
        }
        // 2️⃣ Create journal
        const [journalResult] = await connection.query(
            `INSERT INTO journal (reference_type, reference_id, date, name)
             VALUES ('expense', ?, ?, ?)`,
            [expense_id, expense_date, title || 'Expense']
        );

        const journal_id = journalResult.insertId;

        // 3️⃣ Debit expense account
        await connection.query(
            `INSERT INTO journal_entries (journal_id, account_id, debit, credit)
             VALUES (?, ?, ?, 0)`,
            [journal_id, expense_acc, amount]
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
