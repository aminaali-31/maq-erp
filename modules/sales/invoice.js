const pool = require("../../config/db");

exports.createInvoice = async (req,res)=>{

    const connection = await pool.getConnection();

    try{

        await connection.beginTransaction();

        const {
            sales_order_id,
            invoice_date,
            total_amount
        } = req.body;

        /*
        Validate selection
        */

        if(!sales_order_id){
            return res.send("Sales Order id required");
        }
        let final_customer_id;
        if(sales_order_id){

            const [order] = await connection.execute(
                "SELECT customer_id,total_amount FROM sales_orders WHERE id=?",
                [sales_order_id]
            );

            if(order.length===0){
                throw new Error("Sales order not found");
            }

            final_customer_id = order[0].customer_id;
        }

        /*
        Create Invoice
        */

        const [invoiceResult] = await connection.execute(
            `INSERT INTO sales_invoices
            (customer_id,sales_order_id,invoice_date,total_amount,status)
            VALUES (?,?,?,?,?)`,
            [
                final_customer_id,
                sales_order_id || null,
                invoice_date,
                total_amount,
                "posted"
            ]
        );

        const invoice_id = invoiceResult.insertId;

        /*
        Journal Posting ⭐
        */

        const [customer] = await connection.execute(
            `SELECT account_id FROM customers WHERE id=?`,
            [final_customer_id]
            );
        if (!customer[0]) throw new Error('Customer account not found');
        const AR_ACCOUNT_ID = customer[0].account_id; // use auto-created customer account
        const SALES_ACCOUNT_ID = 1;

        const [journalResult] = await connection.execute(
            `INSERT INTO journal
            (name,date,reference_type,reference_id)
            VALUES (?,?,?,?)`,
            [
                `Invoice #${invoice_id}`,
                new Date(),
                "invoice",
                invoice_id
            ]
        );

        const journal_id = journalResult.insertId;

        /*
        Journal Entries
        */

        await connection.execute(
            `INSERT INTO journal_entries
            (journal_id,account_id,debit,credit)
            VALUES (?,?,?,?)`,
            [journal_id,AR_ACCOUNT_ID,total_amount,0]
        );

        await connection.execute(
            `INSERT INTO journal_entries
            (journal_id,account_id,debit,credit)
            VALUES (?,?,?,?)`,
            [journal_id,SALES_ACCOUNT_ID,0,total_amount]
        );

        await connection.commit();

        res.redirect("/sales/invoices?success=1");

    }catch(err){

        await connection.rollback();
        console.error(err);

        res.send("Invoice creation failed");

    }finally{
        connection.release();
    }
};

exports.showInvoiceForm = async (req,res)=>{

    const [customers] = await pool.execute(
        "SELECT id,name FROM customers"
    );

    const [salesOrders] = await pool.execute(
        "SELECT id,total_amount FROM sales_orders;"
    );

    res.render("sales/invoice",{
        customers,
        salesOrders
    });
};


exports.listInvoices = async (req,res)=>{

    try{

        const [invoices] = await pool.execute(`
            SELECT 
                i.id,
                i.invoice_date,
                i.total_amount,
                i.status,
                c.name AS customer_name
            FROM sales_invoices i
            LEFT JOIN customers c 
            ON c.id = i.customer_id
            ORDER BY i.id DESC
        `);

        res.render("sales/invoiceList",{
            invoices,
            success:req.query.success
        });

    }catch(err){
        console.error(err);
        res.status(500).send("Error loading invoices");
    }
};