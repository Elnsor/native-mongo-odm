# Native Mongo ODM Framework 🚀

A lightweight, high-performance, boilerplate-free backend framework built directly on top of the native MongoDB driver for Node.js and Express.

## 🏗️ Architectural Philosophy

Most modern Node.js applications suffer from bloated boilerplate code, requiring developers to write duplicate routers, controllers, and models for every single database collection. 

This framework solves that by introducing a **Generic Data Gateway** pattern:
* **Universal Routing:** A single router dynamically handles standard CRUD operations across any database collection via URL parameters (`/api/:collectionName`).
* **Zero Boilerplate:** Adding a new resource requires zero configuration files; the core engine handles compilation and validation automatically.
* **Maximum Performance:** Built natively without heavy wrappers like Mongoose, ensuring zero memory waste and blazing-fast execution speeds.

## 🛠️ Current Core Features (Baseline)

- **Dynamic Router Engine:** Unified routing pipeline with route parameters inheritance.
- **Strict Schema Validation Manager:** Built-in validation loop that filters unauthorized fields during compilation before data hits the disk.
- **Native Index Constructor:** Automated indexing engine handled inside a centralized `CollectionManager`.

## 📈 Upcoming Roadmap

- [ ] **Class-Based (Code-First) Models:** Moving schemas into local JavaScript classes for compile-time safety.
- [ ] **Lifecycle Hooks System:** Implementing asynchronous `beforeCreate` and `afterCreate` hooks to handle domain logic (e.g., automated password hashing via bcrypt, inventory updates) within the request cycle.
- [ ] **Native Database Expressions:** Advanced compound validation linking `$jsonSchema` and `$expr` for system fields.
- [ ] **Automated Regression Unit Testing:** Native Node.js test runner integration.