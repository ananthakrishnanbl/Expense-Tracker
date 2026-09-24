const Database = require("better-sqlite3");
const path= require("path");
const crypto = require('crypto');


//Creates a database file if it already doesnt exist
const dbPath = path.resolve(__dirname, "database.db");
const db = new Database(dbPath,{ verbose: console.log });

// Enable WAL mode for better concurrency performance
db.pragma("journal_mode = WAL");

function initDatabase(){
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userName TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        userCode TEXT NOT NULL UNIQUE
        );
    `;

    db.exec(createTableQuery);
}

function getUserCode(){
    const choices="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890";
    let isUnique=false;
    let userCode="";
    const getUser=db.prepare("SELECT * FROM users WHERE userCode = ?");
    while (!isUnique){
        let c=0;
        userCode=""
        for(let i=0; i < 8 ;i++){
            c=crypto.randomInt(0,choices.length);
            userCode=userCode + choices[c];
        }
        const exists = getUser.get(userCode);
        if(!exists){
            isUnique=true;
        }
    }  
    return userCode;
}

function regUser(userName, password) {
    const stmt1 = db.prepare("SELECT 1 FROM users WHERE userName = ?");
    const exists = stmt1.get(userName);
    if (exists) {
        return { status: "USERNAME ALREADY EXISTS" };
    }

    const userCode = getUserCode();

    const registerTransaction = db.transaction(() => {
        const stmt2 = db.prepare("INSERT INTO users (userName, password, userCode) VALUES (?, ?, ?)");
        const res = stmt2.run(userName, password, userCode);

        const tableName = `user_${userCode}`;
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS ${tableName} (
                transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_amount REAL,
                type TEXT CHECK(type IN ('+', '-')),
                transaction_type TEXT CHECK(transaction_type IN ('cash', 'bank')),
                current_bank_balance REAL NOT NULL,
                date TEXT NOT NULL,
                category TEXT,
                note TEXT
            );
        `;
        db.exec(createTableQuery);

        return res.lastInsertRowid;
    });

    const userId = registerTransaction();

    return {
        status: "SUCCESS",
        user: {
            userId: userId,
            userCode,
            userName,
        }
    };
}

function tableExists(userCode){
    const tableName=`user_${userCode}`;
    const stmt=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?;");
    const exists=stmt.get(tableName);
    return Boolean(exists);
}

function getNumberofTransactions(userCode){
    if(!tableExists(userCode)){
        return{
            status: "USERCODE IS NOT VALID"
        }
    }
    const stmt=db.prepare(`SELECT COUNT(payment_amount) as transaction_number FROM user_${userCode};`);
    const res=stmt.get();
    return {
        status: "SUCCESS",
        ...res
    }
}

function getBankBalance(userCode) {
    if(!tableExists(userCode)){
        return{
            status: "USERCODE IS NOT VALID"
        }
    }

    const tableName = `user_${userCode}`;

    const stmt = db.prepare(`
        SELECT current_bank_balance 
        FROM ${tableName} 
        ORDER BY transaction_id DESC 
        LIMIT 1
    `);

    const balance = stmt.pluck().get();

    return {
        status: "SUCCESS",
        bankBalance: balance ?? 0 // Returns 0 if no transactions exist yet
    };
}

function getTransactions(userCode,n){
    if(!tableExists(userCode)){
        return{
            status: "USERCODE IS NOT VALID"
        }
    }
    const stmt=db.prepare(`
        SELECT * 
        FROM user_${userCode}
        WHERE payment_amount IS NOT NULL
        ORDER BY transaction_id DESC
        LIMIT 10 OFFSET ?
    `);
    const rows=stmt.all(10*(n-1));
    return {
        status: "SUCCESS",
        transaction: rows
    }
}

function insertTransaction(
    userCode,
    amount,
    type,
    transaction_type,
    category = null,
    note = null,
    date = new Date().toISOString().split('T')[0]
){
    if (!tableExists(userCode)) {
        return { status: "USERCODE IS NOT VALID" };
    }
    if (type !== "+" && type !== "-") {
        return { status: "INVALID TYPE" };
    }
    if (transaction_type !== "cash" && transaction_type !== "bank") {
        return { status: "INVALID TRANSACTION TYPE" };
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
        return { status: "INVALID AMOUNT" };
    }

    const tableName = `user_${userCode}`;

    const executeInsert = db.transaction(() => {
        let balance = getBankBalance(userCode).bankBalance;

        if (transaction_type === "bank") {
            balance += (type === "+") ? amt : -amt;
        }

        const res = db.prepare(`
            INSERT INTO ${tableName}
            (payment_amount, type, transaction_type, current_bank_balance, date, category, note)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(amt, type, transaction_type, balance, date, category, note);

        return {
            status: "SUCCESS",
            transaction_id: res.lastInsertRowid,
            current_bank_balance: balance
        };
    });

    return executeInsert();
}

module.exports = {
    db,
    initDatabase,
    regUser,
    tableExists,
    getNumberofTransactions,
    getBankBalance,
    getTransactions,
    insertTransaction
};