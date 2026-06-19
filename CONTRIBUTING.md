# Contributing to Native Mongo ODM 🛠️

Thank you for your interest in contributing! To keep the codebase stable, clean, and high-performing, we enforce a strict **Branch-Based Workflow**. Direct pushes to the `main` branch are completely blocked by protection rules.

## 🌿 Branch Naming Conventions

All new work must be developed on a separate branch pulled from `main`. Your branch name must use one of the following prefixes based on the work being done:

* **`feature/`** - For adding new features or logic (e.g., `feature/lifecycle-hooks`)
* **`bugfix/`** - For fixing broken logic or edge-case bugs (e.g., `bugfix/index-validation`)
* **`refactor/`** - For cleanups and rewrites without changing behavior (e.g., `refactor/schema-cache`)
* **`docs/`** - For updates to documentation or READMEs
* **`chore/`** - For modifying configuration files or dependencies

## 🔄 The Contribution Workflow

1.  **Fork** the repository and clone it locally.
2.  Create your feature branch using the naming rules:
    ```bash
    git checkout -b feature/your-feature-name
    ```
    or new 
    ```bash
    git branch feature/your-feature-name 
    git switch feature/your-feature-name
    ```
3.  Write your code and ensure all existing features remain intact.
4.  **Run the unit tests** locally to ensure no regressions occur:
    ```bash
    npm test
    ```
5.  Commit your changes with clear messages and push your branch:
    ```bash
    git push origin feature/your-feature-name
    ```
6.  Open a **Pull Request (PR)** against our `main` branch.