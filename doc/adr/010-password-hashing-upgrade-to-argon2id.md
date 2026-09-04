# ADR-010: Upgrade Password Hashing Strategy from PBKDF2 to Argon2id

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Development Team
- **Related Files:** `helperhash.js`, `UserService.js`, `package.json`

## Context
The application historically relied on Node.js's native `crypto.pbkdf2` (exposed via the `hashPassworNative` function) for hashing user passwords, configured with 100,000 iterations and SHA-512. While PBKDF2 was once considered an industry standard, it is fundamentally **CPU-bound**. This makes it increasingly vulnerable to modern brute-force and dictionary attacks utilizing GPUs (Graphics Processing Units) and ASICs (Application-Specific Integrated Circuits), which can compute billions of PBKDF2 hashes per second at minimal cost.

To align the framework with modern cryptographic best practices (such as OWASP recommendations) and provide enterprise-grade protection for user credentials, a more robust, memory-hard hashing algorithm was required. However, an immediate hard cutover was not feasible because:
1. It would instantly invalidate all existing user passwords, forcing a mass password reset.
2. It would break backward compatibility with the current authentication flow.
3. It would require a coordinated migration strategy that does not yet exist in the codebase.

## Decision
We have introduced **Argon2** (specifically the `argon2id` variant) as a new, first-class password hashing feature within the `helperhash.js` module, while **retaining the legacy PBKDF2 implementation** to ensure backward compatibility and enable a gradual, transparent migration.

### Implementation Details

1. **New Argon2 Functions Added: will add in feature**
   - **`argonHashPassword(password)`**: Asynchronously hashes a plaintext password using `argon2id` with optimized, secure parameters:
     - `type`: `argon2id` (provides balanced resistance against both side-channel and GPU-based attacks).
     - `memoryCost`: `65536` (64 MB) – Makes hardware-accelerated attacks economically unviable.
     - `timeCost`: `3` – Provides a deliberate, balanced delay (~50-150ms) to thwart brute-force attempts without degrading legitimate user experience.
     - `parallelism`: `1` – Optimized for standard single-threaded Node.js execution.
   - **`argonVerifyPassword(hash, password)`**: Asynchronously verifies a plaintext password against an existing Argon2 hash.

2. **Backward Compatibility Preserved:**
   - The legacy `hashPassworNative` (PBKDF2) function has been **retained** alongside the new Argon2 functions.
   - Existing user accounts continue to function without any disruption.

3. **Recommended Lazy Migration Strategy:**
   To fully leverage this new feature without disrupting current users, the `verifyPassword` logic in `UserService` should be updated to detect the hash format and upgrade it transparently on successful login:

   ```javascript
   async verifyPassword(password, user) {
       const storedHash = user.accountInfo.passwordHash;
       
       if (storedHash.startsWith('$argon2id$')) {
           // Use the new feature
           const isValid = await argonVerifyPassword(storedHash, password);
           if (!isValid) throw new AppError("Authentication Failed: Invalid Email or Password", 401);
       } else {
           // Fallback to legacy feature for older accounts
           const newHash = await hashPassworNative(password, user.accountInfo.salt);
           const newHashBuffer = Buffer.from(newHash, "hex");
           const oldHashBuffer = Buffer.from(storedHash, "hex");
           
           if (newHashBuffer.length !== oldHashBuffer.length || 
               !crypto.timingSafeEqual(newHashBuffer, oldHashBuffer)) {
               throw new AppError("Authentication Failed: Invalid Email or Password", 401);
           }
           
           // OPTIONAL but Recommended: Transparently upgrade the user to Argon2 
           // upon successful legacy login
           // await this.upgradeUserHashToArgon2(user._id, password);
       }
   }
   ```

## Consequences

### Positive
- **State-of-the-Art Security**: `argon2id` is the winner of the Password Hashing Competition (PHC) and is currently the recommended standard by OWASP. It is highly resistant to both side-channel and GPU-based attacks.
- **Future-Proofing**: The framework now possesses the capability to handle modern authentication security requirements out of the box.
- **Zero Breaking Changes**: By adding this as a parallel feature rather than an immediate replacement, existing systems, tests, and user accounts continue to function without disruption.
- **Gradual Migration Path**: The lazy migration strategy allows the system to progressively upgrade all active users to Argon2 over time, without requiring any user intervention or mass password resets.
- **Tunable Security Parameters**: The memory cost, time cost, and parallelism can be adjusted as hardware capabilities evolve, without changing the underlying algorithm.

### Negative / Caveats
- **Native Dependency Requirement**: The `argon2` npm package requires native C++ bindings. Deployment environments (e.g., Docker containers, CI/CD pipelines, or serverless platforms) must have build tools installed (`python3`, `make`, `g++`) to compile the package successfully during `npm install`.
- **Intentional Performance Cost**: Argon2 is deliberately slower and more memory-intensive than PBKDF2. While this is the desired security behavior, it must be monitored under high-concurrency login spikes to ensure it does not become a bottleneck.
- **Dual Code Path Complexity**: Until all users are migrated, the `verifyPassword` logic must handle both PBKDF2 and Argon2 hashes, slightly increasing the complexity of the authentication flow.
- **Storage Overhead**: Argon2 hashes are significantly longer than PBKDF2 hashes (~100 bytes vs. ~128 bytes hex), requiring slightly more storage per user record (negligible in practice).

## Alternatives Considered
- **Increasing PBKDF2 Iterations**: Rejected because it only linearly increases the cost for both the defender and the attacker, failing to address the fundamental vulnerability to hardware-accelerated attacks.
- **Bcrypt**: Considered as it is widely adopted and memory-hard to some extent. Rejected in favor of Argon2 because `argon2id` provides superior, tunable memory-hardness and is the modern cryptographic successor to bcrypt.
- **Immediate Hard Cutover**: Rejected because it would instantly invalidate all existing user passwords, forcing a mass password reset. The additive feature approach with lazy migration allows for a safe, gradual transition.
- **Relying Solely on a Reverse Proxy for Rate Limiting**: Considered handling brute-force protection only at the infrastructure layer. Rejected because application-level rate limiting (combined with strong hashing) provides defense-in-depth and context-aware throttling.

---

