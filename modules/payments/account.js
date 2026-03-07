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
                j.name,
                je.debit,
                je.credit
            FROM journal_entries je
            JOIN journal j ON je.journal_id = j.id
            WHERE je.account_id = ?
            ORDER BY j.date ASC
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

exports.accountSummary = async (req,res)=>{
    try{

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

        res.render('payments/summary',{
            accounts
        });

    }catch(err){
        console.error(err);
        res.status(500).send("Server Error");
    }
};