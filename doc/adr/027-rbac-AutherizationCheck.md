# 📜 ADR: Ultra-Fast Bitwise Authorization Engine (`AutherizationCheck`)

**Status:** Accepted  
**Component:** `AutherizationCheck` (`src/rbac/authorized/authorization.js`)  
**Pattern:** Strategy / Bitwise Decoder / Facade  
**Date:** 14-10-2026

## 🏛️Context & Motivation
In high-throughput applications, authorization checks are the most frequently executed operations. Traditional RBAC systems rely on deep object traversal, array `.includes()` checks, or database queries, resulting in **O(N)** latency and heavy Garbage Collection (GC) pressure.

**Decision:** We implemented `AutherizationCheck` as a pure, stateless bitwise decoder. It translates a pre-compiled **32-bit packed integer** from the `RoleBinaryWorker` buffer into actionable permission booleans in **O(1) time**, guaranteeing sub-microsecond execution with zero memory allocation.

---

## 🏗️ Core Strategies: When to Use Which

This class provides two distinct execution paths for authorization:

### 1. 🔥 The Hot-Path: `checkAccess()`
- **When to use:** In high-frequency middleware, API gateways, or internal service-to-service calls where latency is the absolute highest priority.
- **Why:** It performs pure mathematical bitwise operations. It has **zero telemetry overhead**, making it the fastest possible authorization check in Node.js.

### 2. 📊 The Telemetry-Path: `checkAccessWithMonitor()`
- **When to use:** In user-facing endpoints, admin dashboards, or during debugging/auditing phases where you need to track *who* is being denied access and *how long* checks are taking.
- **Why:** It executes the exact same O(1) bitwise logic but wraps it with `record()` and `auditLog()` calls to feed the monitoring system.

---

## 📖 Method Reference & Usage

| Method | Purpose | Complexity | Usage Context |
| :--- | :--- | :--- | :--- |
| `getRole(GroupPid)` | O(1) lookup of the active `RoleBinaryWorker` from the bucket. | **O(1)** | Internal use by `checkAccess`. |
| `checkAccess(...)` | **Core Engine:** Evaluates hierarchy and returns the 32-bit effect integer or an error object. | **O(1)** | High-performance middleware. |
| `checkAccessWithMonitor(...)` | Same as above, but emits `RBAC_AUTH_CHECK` / `RBAC_AUTH_DENIED` metrics. | **O(1)** | Audited endpoints, debug mode. |
| `canPerformPrimary(packed32, targetActionBit)` | Checks if the user can perform the action on their *own* resource. | **O(1)** | Decoding the result of `checkAccess`. |
| `canPerformOnOthers(packed32, targetActionBit)` | Checks if the user can perform the action on *others'* resources. | **O(1)** | Decoding the result of `checkAccess`. |
| `getPrimaryBoundary(packed32)` | Extracts the boundary scope (`OWN`, `LIMITED`, `ALL`) for primary actions. | **O(1)** | UI rendering, conditional logic. |
| `getOthersBoundary(packed32)` | Extracts the boundary scope for delegated/other actions. | **O(1)** | UI rendering, conditional logic. |

*(Note: `getPrimary`, `getPrimaryAction`, `getOthersAction`, and `getOthers` are low-level bitwise extractors used by the helper methods above.)*

---

## ⚡ Performance Characteristics

1. **Zero Allocation:** Bitwise operators (`&`, `>>>`) operate on primitive numbers. No objects, arrays, or strings are created during the check.
2. **O(1) Time Complexity:** The engine does not loop through roles or permissions. It calculates the exact memory offset and reads a single 32-bit integer.
3. **Encapsulation Preservation:** When a TTL expires, it delegates the buffer mutation to `role.handleExpirationAt(newAddr)`. This keeps the `#buffer` strictly private while allowing the authorization engine to trigger surgical cleanup.

---

## 💡 Usage Examples

### Example 1: High-Performance Middleware (Hot-Path)
```javascript
import { rbacManager } from '../rbac/rbacManager.js';
import { DEFAULT_ACTIONS } from '../rbac/constant/resourceType.js';

export const requireDocumentRead = async (req, res, next) => {
    const userRoleId = req.user.accountInfo.roleId;
    
    // 1. Ultra-fast O(1) check (No monitoring overhead)
    const accessEffect = rbacManager.checkAccess(
        userRoleId,
        TYPE_IDS.COLLECTIONS,      // Parent Type
        req.user.collectionIndex,  // Parent Instance
        TYPE_IDS.DOCUMENTS,        // Child Type
        req.params.docIndex        // Child Instance
    );

    // 2. Check if access was fundamentally denied
    if (typeof accessEffect === 'object' && accessEffect.code) {
        return res.status(403).json({ error: accessEffect.message });
    }

    // 3. Decode the 32-bit integer to verify the specific action
    const canRead = rbacManager.allowedPrimaryTarget(accessEffect, DEFAULT_ACTIONS.READ);
    
    if (!canRead) {
        return res.status(403).json({ error: 'Insufficient read permissions' });
    }

    next();
};
```

### Example 2: Audited Admin Action (Telemetry-Path)
```javascript
export const deleteAnyUser = async (req, res, next) => {
    const userRoleId = req.user.accountInfo.roleId;
    const targetUserIndex = req.params.targetIndex;

    // 1. Check with monitoring (emits metrics on success/denial)
    const accessEffect = rbacManager.checkAccessWithMonitor(
        userRoleId,
        TYPE_IDS.COLLECTIONS,
        req.user.collectionIndex,
        TYPE_IDS.USERS,
        targetUserIndex
    );

    if (typeof accessEffect === 'object' && accessEffect.code) {
        // auditLog automatically recorded the denial in the background
        return res.status(403).json({ error: 'Access Denied' });
    }

    // 2. Verify they have DELETE permission on OTHERS' resources
    const canDeleteOthers = rbacManager.allowedTargetToOthers(accessEffect, DEFAULT_ACTIONS.DELETE);
    
    if (!canDeleteOthers) {
        return res.status(403).json({ error: 'Cannot delete other users' });
    }

    next();
};
```
