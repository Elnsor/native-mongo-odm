Here is the Architecture Decision Record (ADR) documenting the refactoring of the authentication controllers and the introduction of the `UserService`, written in standard professional English.

---

# ADR-007: Implementation of Service Layer for Authentication and User Management

- **Status:** Accepted
- **Date:** 2026-09-01
- **Deciders:** Development Team
- **Related Files:** `UserService.js`, `authLogin.controller.js`, `authRegister.controller.js`

## Context
Previously, the authentication controllers (`authLogin.controller.js` and `authRegister.controller.js`) were responsible for over 10 distinct tasks, including HTTP payload validation, database querying, password hashing, token generation, and applying security rules. This monolithic approach led to several architectural issues:
1. **Violation of Single Responsibility Principle (SRP):** Controllers were handling both HTTP routing concerns and core business logic.
2. **Code Duplication:** Logic such as JWT token generation and password verification was repeated across multiple files, increasing the risk of inconsistencies (e.g., the previous bug where `newUser.role` was used instead of `newUser.accountInfo.roleName`).
3. **Poor Testability:** Writing unit tests for business logic required mocking the entire Express HTTP request/response cycle, making tests slow, complex, and brittle.
4. **Zero Reusability:** If the same user registration logic was needed for a CLI script, a background job, or a WebSocket handler, the code had to be awkwardly duplicated or extracted.

## Decision
We have introduced a dedicated `UserService` class to encapsulate all business logic related to user management, strictly enforcing the **Separation of Concerns** principle. 

The specific architectural changes are:
1. **Thin Controllers:** Controllers are now strictly responsible for HTTP-level concerns: validating the presence of required payload fields (e.g., `email` and `password`), invoking the appropriate `UserService` method, and formatting the HTTP response or passing errors to `next(err)`.
2. **Centralized Business Logic:** Operations such as email existence checks, cryptographic salt generation, password hashing, security rule evaluation (`securityRulesEngine.evalRoles`), and document insertion are now exclusively handled within the `UserService`.
3. **Single Source of Truth for Token Generation:** The `generateToken` method is now defined exactly once in the `UserService`. This eliminates duplication and guarantees a consistent, correct token payload structure across all authentication flows.
4. **Lazy Initialization:** The `UserService` includes an `init()` method to safely resolve the collection from the `collectionManager` cache on first use, ensuring robustness regardless of the application's boot sequence.

## Consequences

### Positive
- **Enhanced Testability:** Business logic can now be unit-tested in complete isolation. We can mock the `UserService` dependencies and test edge cases (e.g., duplicate emails, wrong passwords) without spinning up an Express server or mocking `req`/`res` objects.
- **Improved Maintainability:** Changes to authentication logic (e.g., upgrading the hashing algorithm or modifying token expiration) now require updates in only one place (`UserService`).
- **High Reusability:** The `UserService` can be easily imported and utilized by any part of the application (e.g., admin scripts, background workers, or microservices) without relying on an HTTP context.
- **Cleaner Codebase:** Controller files are reduced from ~60 lines of complex, nested logic to ~15 lines of clear, readable routing logic.

### Negative / Caveats
- **Slight Architectural Overhead:** Introduces an additional layer of abstraction. New developers must understand the data flow: Route → Controller → Service → Database.
- **State Dependency:** The `UserService` relies on lazy initialization to fetch the collection. If the `collectionManager` cache is dynamically cleared at runtime (which is rare), the service would need to be re-initialized.

## Alternatives Considered
- **Keeping Logic in Controllers:** Rejected due to the growing complexity, violation of SRP, and the inability to effectively unit-test the business rules.
- **Full Repository Pattern:** Considered creating a separate `UserRepository` class just for database operations. Rejected for the current scope, as the `UserService` directly utilizing the cached `collectionManager` is sufficiently abstracted. Adding a repository layer now would introduce premature abstraction without significant immediate benefit.

--- 

