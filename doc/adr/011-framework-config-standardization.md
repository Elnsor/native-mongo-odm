
# ADR-012: Standardization and Centralization of Framework Configuration

- **Status:** Accepted
- **Date:** 2026-08-26
- **Deciders:** Development Team
- **Related Files:** `frameworkConfig.js`, `schemaManager.js`, `BaseController.js`, `SecurityRulesEngine.js`, `CollectionManager.js`

## Context
As the custom ODM/Framework evolved, configuration settings governing core behaviors (such as concurrency control, soft deletion, and security rules) were either scattered across different modules, lacked clear documentation, or contained minor typographical errors (e.g., `auotLoadingRegisterSchema`, `softDocumentDetele`). 

This fragmentation created several risks:
1. **Misalignment:** A risk of configuration-to-code mismatch, where the config file did not perfectly reflect the actual engine implementations.
2. **Poor Developer Experience (DX):** Complex application-level rules (like `managedBySystem` or `strictImmutable`) lacked inline documentation, making the framework difficult for new developers to understand and configure correctly.
3. **Unpredictable Fallbacks:** The absence of explicitly defined default behaviors for edge cases could lead to inconsistent framework behavior.

## Decision
We have consolidated, corrected, and heavily documented `frameworkConfig.js` to serve as the single, authoritative "Source of Truth" for the entire application framework. 

Specific actions taken include:
1. **Typographical Corrections:** Fixed key names to match standard English spelling and their corresponding usage in the codebase (`autoLoadingRegisterSchema`, `softDocumentDelete`).
2. **Comprehensive Inline Documentation:** Added detailed JSDoc comments for all major configuration blocks. The `applicationSchemaRules` array now explicitly defines the expected behavior, usage context, and concrete examples for each rule (`immutable`, `select`, `managedBySystem`, `restrictedRoles`).
3. **Explicit Default Behaviors:** Clearly defined fallback behaviors (e.g., `strictImmutableDefault: false`, `defaultGuestRole: "guest"`, `strictPayloadFiltering: true`) to ensure the framework fails safely and predictably.
4. **Structural Grouping:** Organized settings into logical domains: `schemaDefaults`, `systemManageTypeSpecifications`, `security`, and `cache`, ensuring that every flag has a direct, implemented counterpart in the respective engine.

## Consequences

### Positive
- **Single Source of Truth:** Developers can read `frameworkConfig.js` and immediately understand the framework's capabilities, constraints, and default behaviors without digging into engine code.
- **Elimination of Mismatch Bugs:** Correcting typos ensures that the configuration keys perfectly align with the consuming logic in `BaseController.js` and `schemaManager.js`.
- **Enhanced Maintainability:** Adding new framework-wide features in the future will have a clear, designated place for their configuration and documentation.
- **Zero Breaking Changes:** This is a pure refactor and documentation improvement. Since the consuming code was already updated to match these corrected keys, runtime behavior remains stable and improved.

### Negative / Caveats
- None. This is a foundational improvement with no negative trade-offs.

## Alternatives Considered
- **Scattered Environment Variables:** Considered moving all these toggles to `.env`. *Rejected* because framework-level architectural decisions (like enabling OCC or soft deletion globally) are code-level design choices, not environment-specific deployment variables.
- **Hardcoded Defaults in Engines:** Considered leaving defaults hardcoded inside `SecurityRulesEngine` or `BaseController`. *Rejected* because it violates the DRY (Don't Repeat Yourself) principle and makes it difficult to audit or change global behavior from a single location.

---

