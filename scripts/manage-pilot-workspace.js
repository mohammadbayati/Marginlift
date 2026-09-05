const crypto = require("crypto");

const { createId, hashPassword } = require("../src/auth");
const { normalizeRole } = require("../src/access-control");
const { appendAudit } = require("../src/audit-log");
const { getRetentionPreset } = require("../src/retention-product");
const { closeStorage, initializeStorage, transact } = require("../src/storage");

const qaRoles = Object.freeze(["owner", "admin", "analyst", "viewer"]);

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const item = process.argv.find(value => value.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : fallback;
}

function generatePassword() {
  return `ML-${crypto.randomBytes(15).toString("base64url")}`;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function envName(role, field) {
  return `MARGINLIFT_QA_${role.toUpperCase()}_${field}`;
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name}=MISSING`);
  return value;
}

function normalizeEmail(value, label = "--email") {
  const email = String(value || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error(`${label} must be a valid email address.`);
  return email;
}

function validatePassword(password) {
  if (String(password || "").length < 16) {
    throw new Error("The supplied password must contain at least 16 characters.");
  }
}

function validateDays(days) {
  if (!Number.isFinite(days) || days < 1 || days > 180) {
    throw new Error("--days must be between 1 and 180.");
  }
}

function appendOperatorAudit(db, organizationId, action, targetType, targetId, metadata = {}) {
  appendAudit(db, {
    id: createId("aud"),
    organizationId,
    actorId: "system:qa-bootstrap",
    actorRole: "operator",
    action,
    targetType,
    targetId,
    metadata,
    createdAt: new Date().toISOString()
  });
}

function findOrCreateOrganization(db, organizationName, now) {
  const matchingOrganizations = db.organizations.filter(item =>
    item.name.trim().toLowerCase() === organizationName.trim().toLowerCase()
  );
  if (matchingOrganizations.length > 1) {
    throw new Error("Multiple workspaces have the same name. Resolve the duplicate before onboarding a user.");
  }

  let organization = db.organizations.find(item => item.id === matchingOrganizations[0]?.id);
  const created = !organization;
  if (!organization) {
    organization = {
      id: createId("org"),
      name: organizationName,
      plan: "pilot",
      retentionConfig: getRetentionPreset("generic_ecommerce"),
      createdAt: now,
      updatedAt: now
    };
    db.organizations.push(organization);
    appendOperatorAudit(db, organization.id, "qa_workspace_provisioned", "organization", organization.id, {
      workspace: organization.name
    });
  }
  return { organization, created };
}

function upsertPilotUser(db, organization, input, now) {
  const role = normalizeRole(input.role, { allowOwner: true });
  let user = db.users.find(item => item.email === input.email);
  const existingMembership = user ? db.memberships.find(item => item.userId === user.id) : null;
  if (existingMembership && existingMembership.organizationId !== organization.id) {
    throw new Error("This email already belongs to a different workspace. Use a unique account email.");
  }

  let accountStatus = "PRESENT";
  if (!user) {
    validatePassword(input.password);
    user = {
      id: createId("usr"),
      email: input.email,
      name: input.name,
      passwordHash: hashPassword(input.password),
      accessExpiresAt: input.accessExpiresAt,
      createdAt: now,
      updatedAt: now
    };
    db.users.push(user);
    accountStatus = "CREATED";
  } else if (input.rotate) {
    validatePassword(input.password);
    user.name = input.name;
    user.passwordHash = hashPassword(input.password);
    user.accessExpiresAt = input.accessExpiresAt;
    user.updatedAt = now;
    db.sessions = db.sessions.filter(item => item.userId !== user.id);
    accountStatus = "ROTATED";
  } else {
    user.name = input.name;
    user.accessExpiresAt = input.accessExpiresAt;
    user.updatedAt = now;
  }

  let membership = db.memberships.find(item => item.userId === user.id && item.organizationId === organization.id);
  let membershipStatus = "PRESENT";
  if (!membership) {
    membership = {
      id: createId("mem"),
      organizationId: organization.id,
      userId: user.id,
      role,
      createdAt: now
    };
    db.memberships.push(membership);
    membershipStatus = "CREATED";
  } else if (membership.role !== role) {
    membership.role = role;
    membership.updatedAt = now;
    membershipStatus = "UPDATED";
  }

  return { user, membership, accountStatus, membershipStatus };
}

async function provisionSinglePilotUser() {
  const organizationName = getArg("organization");
  const email = getArg("email").toLowerCase();
  const name = getArg("name", email.split("@")[0] || "Pilot user");
  const role = normalizeRole(getArg("role", "owner"), { allowOwner: true });
  const password = getArg("password", generatePassword());
  const days = Number(getArg("days", "30"));

  if (organizationName.length < 2) throw new Error("--organization is required and must contain at least 2 characters.");
  normalizeEmail(email);
  validatePassword(password);
  validateDays(days);

  await initializeStorage();
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const result = await transact(db => {
    const { organization, created } = findOrCreateOrganization(db, organizationName, now.toISOString());
    const { user, membership } = upsertPilotUser(db, organization, {
      email,
      name,
      role,
      password,
      rotate: true,
      accessExpiresAt
    }, now.toISOString());

    return {
      organization: { id: organization.id, name: organization.name, created },
      user: { email, name: user.name, role: membership.role, accessExpiresAt },
      temporaryPassword: password
    };
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function provisionQaWorkspace() {
  const organizationName = getArg("organization", process.env.MARGINLIFT_QA_ORGANIZATION || "").trim();
  const days = Number(getArg("days", process.env.MARGINLIFT_QA_ACCESS_DAYS || "30"));
  const rotate = hasFlag("rotate");
  const disable = hasFlag("disable");

  if (organizationName.length < 2) throw new Error("--organization or MARGINLIFT_QA_ORGANIZATION is required.");
  validateDays(days);

  const identities = qaRoles.map(role => {
    const emailVar = envName(role, "EMAIL");
    const passwordVar = envName(role, "PASSWORD");
    const email = normalizeEmail(requiredEnv(emailVar), emailVar);
    const password = disable ? "" : requiredEnv(passwordVar);
    if (!disable) validatePassword(password);
    return {
      role,
      email,
      password,
      name: getArg(`${role}-name`, `QA ${role[0].toUpperCase()}${role.slice(1)}`)
    };
  });

  await initializeStorage();
  const now = new Date();
  const nowIso = now.toISOString();
  const accessExpiresAt = disable
    ? nowIso
    : new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const result = await transact(db => {
    const { organization, created } = findOrCreateOrganization(db, organizationName, nowIso);
    const members = identities.map(identity => {
      const { user, membership, accountStatus, membershipStatus } = upsertPilotUser(db, organization, {
        ...identity,
        rotate,
        accessExpiresAt
      }, nowIso);

      let status = accountStatus === "CREATED" || membershipStatus === "CREATED" ? "CREATED" : "PRESENT";
      if (accountStatus === "ROTATED") status = "ROTATED";
      if (membershipStatus === "UPDATED" && status === "PRESENT") status = "UPDATED";
      if (disable) {
        user.accessExpiresAt = nowIso;
        user.updatedAt = nowIso;
        db.sessions = db.sessions.filter(item => item.userId !== user.id);
        status = "DISABLED";
      }

      const action = disable
        ? "qa_member_disabled"
        : status === "ROTATED"
          ? "qa_credential_rotated"
          : status === "CREATED"
            ? "qa_member_provisioned"
            : status === "UPDATED"
              ? "qa_member_role_updated"
              : null;
      if (action) {
        appendOperatorAudit(db, organization.id, action, "membership", membership.id, {
          role: membership.role,
          email: user.email
        });
      }

      return {
        role: membership.role,
        email: user.email,
        account: status,
        membership: membershipStatus,
        credential: disable ? "DISABLED" : "PRESENT",
        accessExpiresAt: user.accessExpiresAt || null
      };
    });

    return {
      mode: "secure_qa_bootstrap",
      organization: { id: organization.id, name: organization.name, status: created ? "CREATED" : "PRESENT" },
      members
    };
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function main() {
  if (hasFlag("qa-bootstrap")) {
    await provisionQaWorkspace();
  } else {
    await provisionSinglePilotUser();
  }
}

if (require.main === module) {
  main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
    .finally(() => closeStorage().catch(() => undefined));
}

module.exports = { provisionQaWorkspace, provisionSinglePilotUser };
