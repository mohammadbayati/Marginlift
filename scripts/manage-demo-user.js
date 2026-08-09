const crypto = require("crypto");

const { createId, hashPassword } = require("../src/auth");
const { closeStorage, initializeStorage, readDb, transact } = require("../src/storage");

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const item = process.argv.find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : fallback;
}

function generatePassword() {
  return `ML-${crypto.randomBytes(12).toString("base64url")}`;
}

async function main() {
  const email = getArg("email").toLowerCase();
  const name = getArg("name", "مهمان دمو");
  const password = getArg("password", generatePassword());
  const days = Number(getArg("days", "7"));

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("--email باید یک ایمیل معتبر باشد.");
  if (password.length < 16) throw new Error("رمز حساب دمو باید حداقل ۱۶ کاراکتر باشد.");
  if (!Number.isFinite(days) || days < 1 || days > 30) throw new Error("--days باید بین ۱ تا ۳۰ باشد.");

  await initializeStorage();
  const snapshot = await readDb();
  const organization = snapshot.organizations
    .map(item => ({
      ...item,
      activity: snapshot.customerAnalyses.filter(row => row.organizationId === item.id).length
        + snapshot.campaigns.filter(row => row.organizationId === item.id).length
        + snapshot.outcomes.filter(row => row.organizationId === item.id).length
    }))
    .sort((a, b) => b.activity - a.activity)[0];

  if (!organization) throw new Error("هیچ فضای کاری برای اتصال حساب دمو پیدا نشد.");

  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const result = await transact(db => {
    let user = db.users.find(item => item.email === email);
    if (user) {
      user.name = name;
      user.passwordHash = hashPassword(password);
      user.accessExpiresAt = accessExpiresAt;
      user.updatedAt = now.toISOString();
      db.sessions = db.sessions.filter(item => item.userId !== user.id);
    } else {
      user = {
        id: createId("usr"),
        email,
        name,
        passwordHash: hashPassword(password),
        accessExpiresAt,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      db.users.push(user);
    }

    let membership = db.memberships.find(item => item.userId === user.id);
    if (!membership) {
      membership = {
        id: createId("mem"),
        organizationId: organization.id,
        userId: user.id,
        role: "viewer",
        createdAt: now.toISOString()
      };
      db.memberships.push(membership);
    } else {
      membership.organizationId = organization.id;
      membership.role = "viewer";
      membership.updatedAt = now.toISOString();
    }

    return { email, name, password, accessExpiresAt, organization: organization.name, role: membership.role };
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => closeStorage().catch(() => undefined));
