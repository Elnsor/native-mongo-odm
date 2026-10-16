### 1. Architecture Decision Record (ADR)

# ADR-00X: Universal Collection Routing & Bitwise RBAC Authorization

**Status:** Proposed / Under Review  
**Date:** 2026-10-16  
**Deciders:** Framework Core Team  

## Context
The framework requires a standardized, high-performance mechanism to expose CRUD endpoints for any registered MongoDB collection. Furthermore, as the system scales, legacy array-based permission checks are too slow and lack data-level security (preventing Insecure Direct Object Reference - IDOR). We need an authorization layer that operates in **O(1) time complexity** and enforces boundary rules (e.g., a user can only edit their *OWN* documents, not *ALL* documents).

## Decision
We implement a **Universal Router** (`universal.routes.js`) paired with a **Bitwise Authorization Middleware Factory** (`authorizeCheck`). 
Instead of writing custom controllers and routes for every collection, `universalRouter` dynamically maps HTTP verbs to the generic `BaseController`. The `authorizeCheck` middleware intercepts requests, resolves the user's role to a binary PID, queries the in-memory RBAC TypedArray buffer, and enforces data-level boundaries (`OWN`, `ALL`, `LIMITED`) before the database is ever touched.

## Architecture & Request Flow
1. **Identity Gate (`tokenauth`)**: Validates JWT, attaches `req.user`.
2. **Authorization Gate (`authorizeCheck`)**: 
   - Extracts `roleName` -> resolves to `GroupRoleId` (PID).
   - Maps string resource names (from `authOptions`) to binary PIDs.
   - Queries the binary buffer via `rbacManager.checkAccess()`.
   - **Boundary Enforcement**: Checks if the target `req.params._id` belongs to `req.user._id`. 
   - **Scope Injection**: If the user has `OWN` boundary access but no specific ID is targeted (e.g., `GET /collection`), it injects `req.rbacScope = 'OWN'` and `req.rbacOwnerId` so the controller filters the DB query.
3. **Validation Gate (`validator` / `validationCollection`)**: Sanitizes payload against MongoDB `$jsonSchema`.
4. **Execution (`BaseController`)**: Performs the atomic DB operation.

## Usage Guide
To use `authorizeCheck`, you define an `authOptions` object mapping your resource hierarchy:

```javascript
const authOptions = {
  parentTypePid: TYPE_IDS.COLLECTIONS,      // 1st Level: e.g., COLLECTIONS
  parentInsName: "users",                   // Instance: e.g., "users" collection
  childTypePid: TYPE_IDS.DOCUMENTS,         // 2nd Level: e.g., DOCUMENTS
  childInsName: "doc",                      // Instance: generic doc
  grandChildTypePid: null,                  // 3rd Level (Optional)
  grandchildInsName: null,
  ownerFildChecker: '_id',                  // Which req param holds the owner ID
};

// Apply to route
router.get("/:_id", tokenauth, authorizeCheck('READ', authOptions), controller.findById);
```

## Key Strengths
* **Sub-Microsecond Auth**: Authorization is reduced to bitwise `AND`/`OR` operations on `Uint32Array` buffers. No database lookups or array iterations are required during the request lifecycle.
* **Data-Level Security (IDOR Prevention)**: Natively understands the difference between `BOUNDARY.OWN` and `BOUNDARY.ALL`. It automatically blocks users from accessing resources they don't own if the role dictates it.
* **Declarative Hierarchy**: Supports complex 3-tier resource mapping (Parent -> Child -> Grandchild) out of the box.
* **Zero-Allocation**: The middleware factory calculates the `actionBit` exactly *once* at server startup, not on every request.

---
### Critical Areas for Update in feature soon
1. The "Universal" Router is Hardcoded (Security/Logic Bug)
In universal.routes.js, the authOptions hardcodes parentInsName: "users". 
Impact: If a user requests GET /api/products, the RBAC engine will check permissions against the users collection instance, not products. This completely breaks the concept of a universal router.
Fix: authorizeCheck must accept a resolver function for dynamic instances, or read from req.params.collectionName.
2. Missing Dynamic Child Resolution
childInsName: "doc" is hardcoded. In a universal router, the "child" is the actual document being accessed. The middleware should ideally map req.params._id directly to the child instance if the resource taxonomy requires it.