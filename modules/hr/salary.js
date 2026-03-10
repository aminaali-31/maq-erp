const db = require('../../config/db');


exports.addPayroll = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { emp_id, month, account, basic_salary, allowance, overtime, deductions } = req.body;

        const net_salary = Number(basic_salary) + Number(allowance || 0) + Number(overtime || 0) - Number(deductions || 0);

        await connection.beginTransaction();
        const account_id = parseInt(account);
        // 1️⃣ Insert payroll record
        const [payrollResult] = await connection.execute(
            `INSERT INTO payroll (emp_id, date, month, basic_salary, allowance, overtime, deductions)
             VALUES (?, NOW(), ?,?, ?, ?, ?)`,
            [emp_id, month, basic_salary, allowance, overtime, deductions]
        );

        const payrollId = payrollResult.insertId;

        // 2️⃣ Create Journal Header
        const [journalResult] = await connection.execute(
            `INSERT INTO journal (reference_type, reference_id,date,name)
             VALUES (?,?, ?, ?)`,
            ['PAYROLL', payrollId, payroll_date,`Salary Expense for Employee #${emp_id}`]
        );

        const journalId = journalResult.insertId;

        const SALARY_EXPENSE_ACCOUNT = 5; // change according to your chart of accounts

        await connection.execute(
            `INSERT INTO journal_entries (journal_id, account_id, debit, credit)
             VALUES (?, ?, ?, 0)`,
            [journalId, SALARY_EXPENSE_ACCOUNT, net_salary]
        );

        await connection.execute(
            `INSERT INTO journal_entries (journal_id, account_id, debit, credit)
             VALUES (?, ?, 0, ?)`,
            [journalId, account_id, net_salary]
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

        const [accounts] = await db.execute(`
            SELECT * FROM accounts`);

        res.render("hr/payroll", { employees, accounts });
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