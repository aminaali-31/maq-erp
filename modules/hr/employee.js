const db = require('../../config/db');

exports.showAddEmployeeForm = async (req, res) => {
    try {

        const [departments] = await db.execute(
            "SELECT id,name FROM departments"
        );

        res.render('hr/add', {
            departments
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.addEmployee = async (req, res) => {
    try {

        const { name, depart_id, salary } = req.body;

        await db.execute(
            `INSERT INTO employees 
            (name, depart_id, salary) 
            VALUES (?, ?, ?)`,
            [name, depart_id, salary]
        );

        res.redirect('/hr/list');

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.listEmployees = async (req, res) => {
    try {

        const [employees] = await db.execute(`
            SELECT e.*, d.name AS department_name
            FROM employees e
            LEFT JOIN departments d 
            ON e.depart_id = d.id
        `);

        res.render('hr/list', {
            employees
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.showDashboard = async (req, res) => {
    try {

        // ✅ Total Employees
        const [totalEmployeesResult] = await db.execute(`
            SELECT COUNT(*) AS total 
            FROM employees 
            WHERE status='active'
        `);

        const totalEmployees = totalEmployeesResult[0].total;

        // ✅ New Hires This Month
        const [newHiresResult] = await db.execute(`
            SELECT COUNT(*) AS total
            FROM employees
            WHERE MONTH(hire_date)=MONTH(CURRENT_DATE())
            AND YEAR(hire_date)=YEAR(CURRENT_DATE())
        `);

        const newHires = newHiresResult[0].total;

        // ✅ Total Payroll Expense
        const [payrollResult] = await db.execute(`
            SELECT IFNULL(SUM(net_salary),0) AS total
            FROM payroll
        `);

        const totalPayroll = payrollResult[0].total;

        // ✅ Department Count
        const [departmentCountResult] = await db.execute(`
            SELECT COUNT(*) AS total FROM departments
        `);

        const departmentCount = departmentCountResult[0].total;

        // ✅ Department Wise Employee Count
        const [departmentWise] = await db.execute(`
            SELECT d.name, COUNT(e.id) AS count
            FROM departments d
            LEFT JOIN employees e 
            ON e.depart_id = d.id
            GROUP BY d.id, d.name
        `);

        // ✅ Render Dashboard View
        res.render("hr/dashboard", {
            stats:{
                totalEmployees,
                newHires,
                totalPayroll,
                departmentCount,
                departmentWise
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};