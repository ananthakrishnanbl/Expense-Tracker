const bcrypt = require("bcrypt");
const crypto = require("crypto");

const SECRET_KEY = process.env.PEPPER_KEY || "DEADASFUCK";
const SALT_ROUNDS = 10;

async function hashPasswordWithKey(password) {
  const hmacPassword = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(password)
    .digest("hex");

  return await bcrypt.hash(hmacPassword, SALT_ROUNDS);
}

async function verifyPasswordWithKey(password, storedHash) {
  const hmacPassword = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(password)
    .digest("hex");

  return await bcrypt.compare(hmacPassword, storedHash);
}

module.exports = {
  hashPasswordWithKey,
  verifyPasswordWithKey,
};