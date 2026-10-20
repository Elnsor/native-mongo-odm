# 📜 ADR-029: Expansion of UserService for Full Lifecycle, OCC, and Zero-DB-Hit Optimizations

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Lead Architect / Development Team
- **Related Files:** `UserService.js`, `user.controller.js`, `user.routes.js`, `requireRole.js`
- **Supersedes:** ADR-007 (Initial Service Layer Implementation)

## 1. Context
In **ADR-007**, we introduced `UserService` strictly for Authentication (Login/Register). However, User Mutations (Update, Delete, Change Password, Change Role) were still being routed through the generic `BaseController` and universal CRUD middleware pipeline. 

This generic approach introduced four critical architectural flaws:
1. **Stale Cache Data:** The `tokenauth` LRU cache was not invalidated on mutations, allowing deleted/demoted users to retain access for up to 30 seconds.
2. **Missing Framework Compliance:** Generic routes bypassed the `UserService`, meaning user mutations ignored global `frameworkConfig` rules like Optimistic Concurrency Control (OCC) and Soft-Deletes.
3. **Redundant Middleware Execution:** The generic `validator` and `validationCollection` middlewares were executing schema validation and security rules, and then the `UserService` was doing it *again*, resulting in double DB reads and double CPU cycles.
4. **Authorization Ambiguity:** Changing a user's role relied solely on Dynamic RBAC, leaving a privilege escalation vector if an Admin modified the RBAC dashboard.

## 2. Decision
We have expanded `UserService` to become the **Single Source of Truth for the entire User Lifecycle**. We removed the generic validation middlewares from user routes and moved all orchestration, validation, and persistence logic directly into the Service layer.

### Key Architectural Changes:
1. **Zero-DB-Hit Self-Operations:** `updateUser` and `getUserById` now accept `req.user` (the LRU-cached document). If a user is updating or reading their *own* profile, the service bypasses the database `findOne` query entirely.
2. **Optimistic Concurrency Control (OCC):** All mutations now respect `frameworkConfig.schemaDefaults.optimisticConcurrencyControl`. They lock to the current `version`, increment it on success, and throw a `409 Conflict` on version mismatch.
3. **Soft-Delete Compliance:** `deleteUser` now archives documents with `deletedAt` (unless `hardDelete: true` is passed). All read/write operations explicitly block interaction with soft-deleted users.
4. **Immediate Cache Invalidation:** Every mutation calls `InvalidateUserCache(userId)` immediately after a successful DB write, guaranteeing zero stale auth states.
5. **Hybrid Authorization:** Standard routes use Dynamic RBAC (`authorizeCheck`). System-critical routes (`PATCH /:_id/role`) use a Static Code Gate (`requireRole('ADMIN')`) to prevent dashboard-based privilege escalation.
6. **RBAC Scope Filtering:** `findAllUser` accepts `rbacScope` and `rbacOwnerId` to automatically inject ownership filters into the MongoDB query when the RBAC boundary is `OWN`.

## 3. Consequences

### Positive
- **Massive Performance Gains:** Self-updates and self-fetches now execute with **0 DB reads** for the document retrieval phase.
- **Data Integrity:** OCC prevents "last-write-wins" race conditions when two admins edit the same user simultaneously.
- **Security Hardening:** Soft-deleted users are instantly blocked from logging in or mutating data. Password changes are hardcoded to `req.user._id`, preventing URL parameter spoofing.
- **Cleaner Pipeline:** Removing `validator` and `validationCollection` from `user.routes.js` eliminates double-validation and reduces middleware chain depth.

### Negative / Caveats
- **Service Layer Complexity:** `UserService` is now heavier, containing validation, security evaluation, and persistence logic. This is an acceptable trade-off for domain-specific orchestration.
- **Strict Middleware Bypass:** Developers must remember that user routes *do not* use the global validation middleware. Any new user-specific validation must be added inside `UserService`.

---

