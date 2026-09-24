const jwt = require("jsonwebtoken");
const { db, regUser } = require("./db");
const { hashPasswordWithKey, verifyPasswordWithKey } = require("./auth");

const JWT_SECRET =ecf075de988d430d67187a7bf679f67a8ada725e4331b48b05873c7c5dfcea4cec9a46adf83576d373c94fc5d3b7d4f705c6c8a1fab0e70f1b54df4195b3ca12;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "4h";

// ---------- JWT helpers ----------
function signToken(user) {
    return jwt.sign(
        { userId: user.userId, userCode: user.userCode, userName: user.userName },
        JWT_SECRET,
        { algorithm: "HS256", expiresIn: JWT_EXPIRES_IN }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
        return null;   // expired, tampered, malformed
    }
}

// Express middleware: expects header "Authorization: Bearer <token>"
function authenticate(req, res, next) {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ status: "MISSING TOKEN" });
    }

    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ status: "INVALID OR EXPIRED TOKEN" });
    }

    req.user = payload;   // { userId, userCode, userName, iat, exp }
    next();
}

// ---------- Auth functions ----------
async function login(userName, password) {
    if (typeof userName !== "string" || typeof password !== "string" ||
        userName.trim().length === 0 || password.length === 0) {
        return { status: "INVALID CREDENTIALS" };
    }

    const user = db
        .prepare("SELECT id, userName, password, userCode FROM users WHERE userName = ?")
        .get(userName.trim());

    if (!user) {
        return { status: "INVALID CREDENTIALS" };
    }

    const ok = await verifyPasswordWithKey(password, user.password);
    if (!ok) {
        return { status: "INVALID CREDENTIALS" };
    }

    const safeUser = {
        userId: user.id,
        userCode: user.userCode,
        userName: user.userName
    };

    return {
        status: "SUCCESS",
        user: safeUser,
        token: signToken(safeUser)
    };
}

async function registerUser(userName, password) {
    if (typeof userName !== "string" || typeof password !== "string") {
        return { status: "INVALID INPUT" };
    }

    userName = userName.trim();

    if (userName.length < 3 || userName.length > 30) {
        return { status: "INVALID USERNAME" };
    }
    if (password.length < 8 || password.length > 128) {
        return { status: "INVALID PASSWORD" };
    }

    try {
        const hashed = await hashPasswordWithKey(password);
        const result = regUser(userName, hashed);   // regUser stays synchronous

        if (result.status !== "SUCCESS") {
            return result;
        }

        return { ...result, token: signToken(result.user) };
    } catch (err) {
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return { status: "USERNAME ALREADY EXISTS" };
        }
        throw err;
    }
}

module.exports = { login, registerUser, signToken, verifyToken, authenticate };