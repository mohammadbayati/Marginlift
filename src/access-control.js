const ROLE_RANK = Object.freeze({ viewer: 0, analyst: 1, admin: 2, owner: 3 });
const ASSIGNABLE_ROLES = Object.freeze(["viewer", "analyst", "admin"]);

function requireRole(auth, minimumRole) {
  const actualRank = ROLE_RANK[auth?.membership?.role] ?? -1;
  const requiredRank = ROLE_RANK[minimumRole] ?? Number.MAX_SAFE_INTEGER;
  if (actualRank < requiredRank) {
    const error = new Error("سطح دسترسی شما برای این عملیات کافی نیست.");
    error.status = 403;
    error.code = "INSUFFICIENT_ROLE";
    throw error;
  }
  return auth;
}

function normalizeRole(value, options = {}) {
  const role = String(value || "").trim().toLowerCase();
  const allowed = options.allowOwner ? Object.keys(ROLE_RANK) : ASSIGNABLE_ROLES;
  if (!allowed.includes(role)) {
    const error = new Error("نقش انتخاب‌شده معتبر نیست.");
    error.status = 400;
    error.code = "INVALID_ROLE";
    throw error;
  }
  return role;
}

module.exports = { ASSIGNABLE_ROLES, ROLE_RANK, normalizeRole, requireRole };
