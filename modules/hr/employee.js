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
            employees,
            success:req.query.success,
            error: req.query.error
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

exports.editEmployeeForm = async (req, res) => {
    const { id } = req.params;
    try {
        const [employeeRows] = await db.execute(
            `SELECT e.* , d.name AS dep_name
            FROM employees AS e
            JOIN departments as d ON e.depart_id = d.id
            WHERE e.id = ?`,
            [id]
        );

        if (!employeeRows.length) {
            return res.redirect('/hr/list?error=Employee not found');
        }

        res.render('hr/edit', {
            employee: employeeRows[0],
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (err) {
        console.error(err);
        res.redirect('/hr/list?error=' + encodeURIComponent(err.message));
    }
};


exports.updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { name, department, salary } = req.body;
    const dep = parseInt(department)
    console.log(dep);
    const sal = parseInt(salary)
    if (!name) {
        return res.redirect(`/hr/edit/${id}?error=Namer equired`);
    }

    try {
        await db.execute(
            `UPDATE employees 
             SET name=?, depart_id=?, salary=? 
             WHERE id=?`,
            [name, dep, sal, id]
        );

        res.redirect('/hr/list?success=Employee updated');
    } catch (err) {
        console.error(err);
        res.redirect(`/hr/edit/${id}?error=` + encodeURIComponent(err.message));
    }
};