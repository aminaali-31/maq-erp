const pool = require('../../config/db');

exports.showLedger = async (req, res) => {
    try {

        const accountId = req.params.id;

        // Get account info
        const [accountData] = await pool.execute(
            "SELECT * FROM accounts WHERE id=?",
            [accountId]
        );

        if (!accountData.length) {
            return res.send("Account not found");
        }

        const account = accountData[0];

        // Ledger transactions
        const [entries] = await pool.execute(`
            SELECT 
                j.date,
                j.id,
                j.name,
                je.debit,
                je.credit
            FROM journal_entries je
            JOIN journal j ON je.journal_id = j.id
            WHERE je.account_id = ?
            ORDER BY j.id DESC
        `, [accountId]);

        let balance = 0;

        entries.forEach(e => {

            let debit = Number(e.debit) || 0;
            let credit = Number(e.credit) || 0;

            if(account.type === 'income' || account.type === 'liability'){
                balance += credit - debit;
            }
            else{
                balance += debit - credit;
            }

            e.balance = balance;
        });
        res.render('payments/ledger', {account,entries});

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.showPayable = async (req,res) => {
    try {
        const [payable] = await pool.execute(`
            SELECT 
                v.id AS vendor_id,
                v.name AS name,
                SUM(je.debit) AS debit,
                SUM(je.credit) AS credit,
                SUM(je.credit - je.debit) AS balance
            FROM vendors v
            JOIN accounts a ON v.account_id = a.id
            LEFT JOIN journal_entries je ON je.account_id = a.id
            LEFT JOIN journal j ON je.journal_id = j.id
            GROUP BY v.id, v.name
            ORDER BY v.name;`);
        
        res.render('payments/ledger', {entries: payable, account:{name:'Payables'} 
        })
    } catch (e) {
        console.log(e);
        res.status(500).send("Database Error")
    }
}

exports.showReceivable = async (req,res) => {
    try {
        const [rece] = await pool.execute(`
            SELECT 
                c.name AS name,
                COALESCE(SUM(je.debit), 0) AS debit,
                COALESCE(SUM(je.credit), 0) AS credit,
                COALESCE(SUM(je.debit - je.credit), 0) AS balance
            FROM customers c
            JOIN accounts a 
                ON c.account_id = a.id
            LEFT JOIN journal_entries je 
                ON je.account_id = a.id
            LEFT JOIN journal j 
                ON je.journal_id = j.id
            GROUP BY c.id, c.name
            ORDER BY c.name;`)

        res.render('payments/ledger', {entries: rece, account:{name:'Receivables'}})
    } catch (e) {
        console.log(e);
        res.status(500).send("Database Error")
    }
}

exports.accountSummary = async (req,res)=>{
    try{

        const [accounts] = await pool.execute(`
            SELECT 
                a.id,
                a.name,
                a.type,
                COALESCE(SUM(je.debit),0) AS total_debit,
                COALESCE(SUM(je.credit),0) AS total_credit,
                COALESCE(SUM(je.debit - je.credit),0) AS balance
            FROM accounts a
            LEFT JOIN journal_entries je 
                ON je.account_id = a.id
            LEFT JOIN journal j
                ON j.id = je.journal_id
            WHERE a.name IN ('sales revenue', 'stock account', 'expense')
            GROUP BY a.id
            ORDER BY a.name
        `,);

        const [receivable] = await pool.execute(`
            SELECT 
                COALESCE(SUM(je.debit),0) AS total_debit,
                COALESCE(SUM(je.credit),0) AS total_credit,
                COALESCE(SUM(je.debit - je.credit),0) AS balance
            FROM customers c
            LEFT JOIN accounts a 
                ON c.account_id = a.id
            LEFT JOIN journal_entries je 
                ON je.account_id = a.id
        `);
        
            const [payable] = await pool.execute(`
            SELECT 
                COALESCE(SUM(je.debit),0) AS total_debit,
                COALESCE(SUM(je.credit),0) AS total_credit,
                COALESCE(SUM(je.credit - je.debit),0) AS balance
            FROM vendors v
            LEFT JOIN accounts a 
                ON v.account_id = a.id
            LEFT JOIN journal_entries je 
                ON je.account_id = a.id
        `);
        const [sales] = await pool.execute(`
            SELECT 

                COALESCE(SUM(
                    CASE 
                        WHEN MONTH(j.date) = MONTH(CURRENT_DATE)
                        AND YEAR(j.date) = YEAR(CURRENT_DATE)
                        THEN je.credit ELSE 0
                    END
                ),0) AS this_month_sales,

                COALESCE(SUM(
                    CASE 
                        WHEN YEAR(j.date) = YEAR(CURRENT_DATE)
                        THEN je.credit ELSE 0
                    END
                ),0) AS this_year_sales,

                COALESCE(SUM(je.credit),0) AS total_sales

            FROM accounts a
            JOIN journal_entries je ON je.account_id = a.id
            JOIN journal j ON j.id = je.journal_id
            WHERE a.name='sales revenue'
        `);
        const sale = sales[0];
        const rec = receivable[0];
        const pay = payable[0];

        res.render('payments/summary',{
                accounts,
                sale,
                rec,
                pay
    });
    }catch(err){
        console.error(err);
        res.status(500).send("Server Error");
    }
};

exports.showAllAccounts = async (req,res) => {
    try {
        const [accounts] = await pool.execute(`
                SELECT 
                    a.id,
                    a.name,
                    a.type,
                    IFNULL(SUM(je.debit),0) AS total_debit,
                    IFNULL(SUM(je.credit),0) AS total_credit,

                    CASE 
                        WHEN a.type IN ('asset','expense') 
                            THEN IFNULL(SUM(je.debit),0) - IFNULL(SUM(je.credit),0)

                        WHEN a.type IN ('liability','equity','income') 
                            THEN IFNULL(SUM(je.credit),0) - IFNULL(SUM(je.debit),0)

                        ELSE 0
                    END AS balance

                FROM accounts a
                LEFT JOIN journal_entries je 
                    ON je.account_id = a.id

                GROUP BY a.id, a.name, a.type
                ORDER BY a.name
            `);
        const [receivable] = await pool.execute(`
            SELECT 
                COALESCE(SUM(je.debit),0) AS total_debit,
                COALESCE(SUM(je.credit),0) AS total_credit,
                COALESCE(SUM(je.debit - je.credit),0) AS balance
            FROM customers c
            LEFT JOIN accounts a 
                ON c.account_id = a.id
            LEFT JOIN journal_entries je 
                ON je.account_id = a.id
        `);
        
            const [payable] = await pool.execute(`
            SELECT 
                COALESCE(SUM(je.debit),0) AS total_debit,
                COALESCE(SUM(je.credit),0) AS total_credit,
                COALESCE(SUM(je.credit - je.debit),0) AS balance
            FROM vendors v
            LEFT JOIN accounts a 
                ON v.account_id = a.id
            LEFT JOIN journal_entries je 
                ON je.account_id = a.id
        `);
        const rec = receivable[0];
        const pay = payable[0];

        res.render('payments/allAccounts', {
            accounts,
            rec,
            pay
        })
    }catch(err){
        console.error(err);
        res.status(500).send("Server Error");
    }
}
// Show add account form
exports.showAddAccount = (req, res) => {
    res.render('payments/addAccount', {message:req.query.message});
};

// Save account
exports.storeAccount = async (req, res) => {
    try {

        const { account_name, account_type } = req.body;

        if (!account_name || !account_type) {
            return res.send("Account name and type are required");
        }

        await pool.query(
            `INSERT INTO accounts (name,type)
             VALUES (?, ?)`,
            [account_name, account_type]
        );

        res.redirect('/accounts/add?message=Account added successfully');

    } catch (error) {
        console.error(error);
        res.redirect('/accounts/add?message=Unable to add Account')
    }
};