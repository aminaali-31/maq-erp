const db = require('../../config/db');

exports.addPayroll = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { emp_id, payroll_date, basic_salary, allowance, overtime, deductions } = req.body;

        const net_salary = Number(basic_salary) + Number(allowance || 0) + Number(overtime || 0) - Number(deductions || 0);

        await connection.beginTransaction();

        // 1️⃣ Insert payroll record
        const [payrollResult] = await connection.execute(
            `INSERT INTO payroll (emp_id, date, basic_salary, allowance, overtime, deductions)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [emp_id, payroll_date, basic_salary, allowance, overtime, deductions]
        );

        const payrollId = payrollResult.insertId;

        // 2️⃣ Create Journal Header
        const [journalResult] = await connection.execute(
            `INSERT INTO journal (reference_type, reference_id,date,name)
             VALUES (?,?, ?, ?)`,
            ['PAYROLL', payrollId, payroll_date,`Salary Expense for Employee #${emp_id}`]
        );

        const journalId = journalResult.insertId;

        // 3️⃣ Post Journal Entries
        // Debit → Salary Expense (account_id: SALARY_EXPENSE_ACCOUNT)
        // Credit → Cash/Bank (account_id: CASH_ACCOUNT)

        const SALARY_EXPENSE_ACCOUNT = 5; // change according to your chart of accounts
        const CASH_ACCOUNT = 4;

        await connection.execute(
            `INSERT INTO journal_entries (journal_id, account_id, debit, credit)
             VALUES (?, ?, ?, 0)`,
            [journalId, SALARY_EXPENSE_ACCOUNT, net_salary]
        );

        await connection.execute(
            `INSERT INTO journal_entries (journal_id, account_id, debit, credit)
             VALUES (?, ?, 0, ?)`,
            [journalId, CASH_ACCOUNT, net_salary]
        );

        await connection.commit();

        res.redirect('/hr/payroll/list');

    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('Server error');
    } finally {
        connection.release();
    }
};

exports.showPayrollForm = async (req,res) => {
    try {
        const [employees] = await db.execute(
        "SELECT id,name FROM employees"
        );

        res.render("hr/payroll", { employees });
    }
    catch (e) {
        res.status(500).send('Server error');
    }
}

exports.listPayroll = async (req,res) => {
    try {
        const [payrolls] = await db.execute(`
        SELECT p.*, e.name AS employee_name
        FROM payroll p
        LEFT JOIN employees e ON p.emp_id = e.id
        ORDER BY p.id DESC
        `);

        res.render("hr/payrollList", { payrolls });
    } catch(e) {
        res.status(500).send('Server error');
    }
}