
# ADR-009: Implementation of Global Security Middleware (CORS, Helmet, and Rate Limiting)

- **Status:** Accepted
- **Date:** 2026-09-1
- **Deciders:** Development Team
- **Related Files:** `app.js` (or main entry point), `api.login.routes.js`, `api.register.routes.js`

## Context
Prior to this change, the Express application operated without fundamental HTTP-level security protections. This exposed the system to several common web vulnerabilities and operational risks:
1. **Cross-Origin Vulnerabilities:** Without explicit CORS configuration, the application was either entirely blocked by modern browsers when accessed from a frontend, or overly permissive, risking Cross-Site Request Forgery (CSRF) or data leakage.
2. **Missing Security Headers:** The application did not set critical HTTP headers, leaving it susceptible to attacks like Cross-Site Scripting (XSS), Clickjacking, and MIME-type sniffing.
3. **API Abuse and Brute Force:** Authentication endpoints (`/login`, `/register`) and general API routes had no request throttling, making them highly vulnerable to credential stuffing, brute-force attacks, and Denial-of-Service (DoS) via resource exhaustion.

## Decision
We have integrated three industry-standard security middleware packages at the global application level to establish a robust "Defense in Depth" strategy:

1. **Helmet (`helmet`):** 
   - Applied globally as one of the first middleware functions.
   - Automatically sets secure HTTP headers, including `Content-Security-Policy`, `X-Content-Type-Options` (prevents MIME sniffing), `X-Frame-Options` (prevents clickjacking), and `Strict-Transport-Security` (enforces HTTPS in production).

2. **CORS (`cors`):** 
   - Configured globally to strictly validate the `Origin` header against an allowlist defined in environment variables (`ALLOWED_ORIGINS`).
   - Enabled `credentials: true` to support secure cookie/token-based authentication flows, while explicitly defining allowed HTTP methods and headers to minimize the attack surface.

3. **Rate Limiting (`express-rate-limit`):** 
   - **Global Limiter:** Applied to all routes to prevent basic scraping and volumetric DoS attacks (e.g., 100 requests per 15 minutes per IP address).
   - **Endpoint-Specific Limiters:** Stricter limits are applied to sensitive authentication routes (e.g., 5 attempts per 15 minutes for `/login`, 3 attempts per hour for `/register`) to effectively neutralize brute-force attacks. Successful requests are excluded from the counter to avoid penalizing legitimate users.

## Consequences

### Positive
- **Significantly Reduced Attack Surface:** The application now automatically mitigates a wide range of OWASP Top 10 web vulnerabilities at the HTTP layer.
- **Protection of Critical Assets:** Authentication endpoints are now resilient against automated credential stuffing and brute-force attacks.
- **Standards Compliance:** The application aligns with modern web security best practices, making it safer for production deployment and easier to pass security audits.
- **Dynamic Control:** Application-level rate limiting allows for future enhancements, such as dynamic limits based on user roles or API tiers, which are harder to implement at the reverse-proxy level.

### Negative / Caveats
- **Configuration Dependency:** The CORS configuration relies on the `ALLOWED_ORIGINS` environment variable. If misconfigured (e.g., using `*` in production with credentials enabled), it will either break the frontend or introduce security flaws. Strict validation is required during deployment.
- **Slight Performance Overhead:** Evaluating rate limit counters and injecting security headers adds a marginal computational overhead to every request. However, this is negligible compared to the security benefits and is optimized by the `express-rate-limit` memory store.
- **Proxy Considerations:** If the application is deployed behind a reverse proxy (like Nginx or AWS ALB), the `trust proxy` setting in Express must be enabled (`app.set('trust proxy', 1)`), otherwise, the rate limiter will see the proxy's IP address instead of the client's real IP, leading to unfair blocking.

## Alternatives Considered
- **Relying Solely on a Reverse Proxy (e.g., Nginx, AWS WAF):** Considered handling all rate limiting and security headers at the infrastructure layer. *Rejected* as the *sole* solution because application-level middleware provides context-aware throttling (e.g., different limits for `/login` vs. `/api/users`) and ensures the application remains protected even if infrastructure configurations are accidentally altered or bypassed.
- **Custom-Built Security Middleware:** Considered writing custom logic for headers and rate limiting. *Rejected* because established, actively maintained libraries like `helmet` and `express-rate-limit` are heavily audited, widely tested, and reduce the risk of introducing custom security bugs.

--- 

*Note: This ADR should be saved in your project's documentation folder, for example: `docs/adr/009-global-security-middleware.md`.*