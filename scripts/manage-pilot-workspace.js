const crypto = require("crypto");

const { createId, hashPassword } = require("../src/auth");
const { getRetentionPreset } = require("../src/retention-product");
const { closeStorage, initializeStorage, readDb, transact } = require("../src/storage");

const allowedRoles = new Set(["owner", "admin", "analyst", "viewer"]);

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const item = process.argv.find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : fallback;
}

function generatePassword() {
  return `ML-${crypto.randomBytes(15).toString("base64url")}`;
}

async function main() {
  const organizationName = getArg("organization");
  const email = getArg("email").toLowerCase();
  const name = getArg("name", email.split("@")[0] || "Pilot user");
  const role = getArg("role", "owner").toLowerCase();
  const password = getArg("password", generatePassword());
  const days = Number(getArg("days", "30"));

  if (organizationName.length < 2) throw new Error("--organization is required and must contain at least 2 characters.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("--email must be a valid email address.");
  if (!allowedRoles.has(role)) throw new Error("--role must be owner, admin, analyst, or viewer.");
  if (password.length < 16) throw new Error("The generated or supplied password must contain at least 16 characters.");
  if (!Number.isFinite(days) || days < 1 || days > 180) throw new Error("--days must be between 1 and 180.");

  await initializeStorage();
  const snapshot = await readDb();
  const matchingOrganizations = snapshot.organizations.filter(item => item.name.trim().toLowerCase() === organizationName.trim().toLowerCase());
  if (matchingOrganizations.length > 1) throw new Error("Multiple workspaces have the same name. Resolve the duplicate before onboarding a user.");

  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const result = await transact(db => {
    let organization = db.organizations.find(item => item.id === matchingOrganizations[0]?.id);
    if (!organization) {
      organization = {
        id: createId("org"),
        name: organizationName,
        plan: "pilot",
        retentionConfig: getRetentionPreset("generic_ecommerce"),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
      db.organizations.push(organization);
    }

    let user = db.users.find(item => item.email === email);
    const existingMembership = user ? db.memberships.find(item => item.userId === user.id) : null;
    if (existingMembership && existingMembership.organizationId !== organization.id) {
      throw new Error("This email already belongs to a different workspace. Use a unique account email.");
    }

    if (!user) {
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
    } else {
      user.name = name;
      user.passwordHash = hashPassword(password);
      user.accessExpiresAt = accessExpiresAt;
      user.updatedAt = now.toISOString();
      db.sessions = db.sessions.filter(item => item.userId !== user.id);
    }

    let membership = db.memberships.find(item => item.userId === user.id && item.organizationId === organization.id);
    if (!membership) {
      membership = {
        id: createId("mem"),
        organizationId: organization.id,
        userId: user.id,
        role,
        createdAt: now.toISOString()
      };
      db.memberships.push(membership);
    } else {
      membership.role = role;
      membership.updatedAt = now.toISOString();
    }

    return {
      organization: { id: organization.id, name: organization.name, created: matchingOrganizations.length === 0 },
      user: { email, name, role, accessExpiresAt },
      temporaryPassword: password
    };
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => closeStorage().catch(() => undefined));
