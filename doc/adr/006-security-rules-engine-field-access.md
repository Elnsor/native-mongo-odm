Here is the Architecture Decision Record (ADR) documenting the design and implementation of the `SecurityRulesEngine.js`, written in standard professional English.

---

# ADR-006: Implementation of Centralized Security and Business Rules Engine for Field-Level Access Control

- **Status:** Accepted
- **Date:** 2024-05-20
- **Deciders:** Development Team
- **Related Files:** `SecurityRulesEngine.js`, `SchemaBuilder.js`, `appRolesMeddlware.js`

## Context
In complex applications, data integrity and security often require rules that go beyond simple data type validation. For example:
1. **Field-Level Access Control:** Only administrators should be allowed to modify sensitive fields like `accountInfo.status` or `accountInfo.roleId`.
2. **Immutability:** Certain fields (like `createdAt` or `userId`) must never be altered after the initial document creation.
3. **Auto-Generated/System-Managed Data:** Fields like `updatedAt` or computed fields (like `publicInfo.displayName` derived from first and last names) must be generated or overwritten by the system, ignoring any malicious or accidental input from the client.

Scattering these rules across various controllers or relying entirely on database-level triggers makes the application logic fragmented, difficult to test, and hard to maintain.

## Decision
We have implemented a centralized `SecurityRulesEngine` that acts as a pre-database execution gate. It intercepts the sanitized document payload and evaluates it against the application-level rules (`appRoles`) defined in the `SchemaBuilder`. 

The engine is designed with the following core architectural decisions:

1. **Native Dot-Notation Traversal:** 
   - Implemented custom `_getNestedValue` and `_setNestedValue` helper methods. This allows the engine to seamlessly read and write deeply nested fields (e.g., `accountInfo.email` or `publicInfo.displayName`) without requiring flattened document structures.

2. **Strict Immutability Enforcement:**
   - The engine checks `appRoles.immutable` during update operations. 
   - It supports a `strictImmutable` flag: if enabled, it prevents a field from being initialized *even if it was previously undefined/null* during an update, ensuring absolute write-once behavior.

3. **Role-Based Field Restrictions:**
   - Evaluates `appRoles.restrictedRoles` (e.g., `["ADMIN"]`). If a client attempts to modify a restricted field and their `userContextRole` does not match the allowed roles, the engine immediately throws a `403 Forbidden` `AppError`.

4. **Extensible System-Managed Strategies:**
   - Built-in core types (like `date` for timestamps) are executed synchronously.
   - Introduced `registerCustomCore()`, allowing developers to inject custom business logic strategies (e.g., `formatDisplayName` or `slugify`) that are executed dynamically during the document lifecycle.
   - Custom strategies are queued and executed after the main validation loop to ensure all dependent fields are already validated and present in the payload.

## Consequences

### Positive
- **Single Source of Truth for Security:** All field-level mutation rules are defined declaratively in the `SchemaBuilder` and enforced centrally by this engine. Controllers remain completely unaware of these security constraints.
- **Fail-Fast Protection:** Malicious attempts to overwrite system-managed fields or modify restricted fields are blocked in memory *before* any database I/O occurs.
- **High Extensibility:** The `registerCustomCore` pattern allows the framework to adapt to complex business requirements (like dynamic slug generation or AI-based field formatting) without modifying the engine's core loop.
- **Deep Document Support:** The custom dot-notation handlers prevent the need for complex recursive object merging, keeping the execution path fast and predictable.

### Negative / Caveats
- **Processing Overhead:** The engine iterates over the entire schema blueprint (`blueprintkey`) for every write/update request. While mitigated by the in-memory schema cache, it adds a computational step to the request lifecycle.
- **Synchronous Custom Strategies:** Currently, custom core strategies are expected to be synchronous. If a custom strategy requires an asynchronous operation (like an external API call to validate or generate data), the current `eval_roles` loop architecture would need to be refactored to support `await` inside the custom execution phase.

## Alternatives Considered
- **Database Triggers (MongoDB Change Streams / Atlas Triggers):** Considered handling auto-generations and immutability at the database level. *Rejected* because it moves business logic out of the application codebase, making it harder to version control, test, and debug.
- **Middleware-Only Validation:** Considered writing custom Express middleware for every restricted field. *Rejected* because it violates the DRY (Don't Repeat Yourself) principle and tightly couples security logic to the HTTP routing layer rather than the data schema.

--- 

