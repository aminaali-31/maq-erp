const pool = require('../../config/db');


exports.showExpenseForm = async (req, res) => {
    try {
        const [accounts] = await pool.execute(`
            SELECT * FROM accounts`);

        const [orders] = await pool.execute(
            `SELECT so.*, c.name as customer_name
            FROM sales_orders so
            LEFT JOIN customers c ON c.id = so.customer_id
            WHERE so.progress IN ('pending','happening')`
        );
        const [items] = await pool.execute(
            `SELECT 
            si.id AS item_id,
            si.so_id,
            si.p_id,
            si.quantity,
            si.cost_price,
            p.name AS product_name
        FROM so_items si
        JOIN products p ON p.id = si.p_id
        WHERE p.type = 'service'
;`

        );

        res.render('payments/addExpense', { accounts, orders, items, success: req.query.success, error: req.query.error });
    } catch (e) {
        console.error(e);
        res.status(500).send("Database Error")
    }
}
exports.addExpense = async (req, res) => {

    const connection = await pool.getConnection();

    try {

        const { title, amount, account, expense_date, type, order_id, item_id } = req.body;

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
                `UPDATE so_items
                SET 
                    cost_price = COALESCE(cost_price, 0) + ?
                WHERE id = ?;`,
                [amount, item_id]
            );
            await connection.query(
            `UPDATE sales_orders so
            JOIN quotations q 
                ON q.id = so.quotation_id
            SET 
                so.total_amount = COALESCE(so.total_amount, 0) + ?,
                so.profit = q.grand_total - (COALESCE(so.total_amount, 0) + ?)
            WHERE so.id = ?`,
            [amount, amount, order_id]
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
                expenses.status,
                expenses.type,
                expenses.sale_order_id
            FROM expenses
            ORDER BY expenses.expense_date DESC
        `);

        res.render('payments/expneseList', { expenses });

    } catch (error) {

        console.error(error);
        res.send("Error loading expenses");

    }

};
