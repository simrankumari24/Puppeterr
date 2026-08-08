# 🧩 Overview
Thank you for your interest in contributing to Puppeterr — a modular agent‑orchestration framework combining Planner, Instinct, Reasoner, Vision, and Strider.
This project aims to deliver high‑performance autonomous browsing with human‑in‑the‑loop guidance, robust fallback logic, and real‑time reasoning.

This guide explains how to contribute effectively and consistently.

## 🛠️ Development Setup
To work on Puppeterr locally:

Clone the repository

Install dependencies

Start the development server

Run the agent in a browser‑enabled environment (Xvfb or equivalent)

If Cloudflare model listing fails, Puppeterr supports text‑based model catalog import.
See model-catalog.txt.example for details.

# 📁 Project Structure
Key modules include:

Planner — step execution, selectors, fallback logic

Instinct — confusion detection, safety checks

Reasoner — natural‑language explanations and guidance

Vision — DOM extraction, screenshot analysis

Strider — reconnaissance crawler and dynamic DOM dump

Stress Tester — autonomous evaluation harness

UI — frontend interface and runtime display

Pipeline — agent loop, verification, sampling tunables

Understanding these modules will help you contribute effectively.

# 🔧 How to Contribute
Open an Issue
Before submitting a PR, please open an issue describing:

The problem

Proposed solution

Relevant logs or screenshots

Affected modules

This helps maintainers track changes and avoid duplicate work.

Submit a Pull Request
PR requirements:

Clear title and description

Reference the related issue

Keep changes focused and modular

Avoid committing build artifacts or node_modules

Ensure code passes linting and basic runtime tests

Include comments for complex logic (especially Planner, Vision, and Strider)

Large refactors (e.g., agent.js modularization) should be discussed before implementation.

# 🔒 Security
If you discover a security vulnerability:

Do not open a public issue

Follow the steps in SECURITY.md

Provide reproduction steps privately

Puppeterr uses CodeQL scanning; please address flagged alerts promptly.

## 🧪 Testing
Before submitting a PR:

Run the stress tester (stress-tester.js)

Validate Planner fallback behavior

Confirm Vision pipeline stability

Test dynamic DOM extraction

Verify that /api/guidance and /api/runtime endpoints behave correctly

## 📦 Releases
Versioning follows a milestone‑based pattern:

Major versions introduce architectural changes

Minor versions add features or improvements

Patch versions fix bugs or stabilize pipelines

Example:
v5.0.1 will ship once the image analysis pipeline is fully stable.

## 🤝 Code Style
Use clear, descriptive variable names

Avoid deeply nested logic when possible

Keep modules focused and cohesive

Document non‑obvious behavior

Prefer pure functions where applicable

Avoid shell command concatenation without sanitization

## 💬 Communication
For questions, discussions, or design proposals, use:

GitHub Issues

GitHub Discussions

Pull Request comments

Please keep communication constructive and respectful.

## 🙏 Thank You
Your contributions help Puppeterr evolve into a powerful, modular agent framework capable of real‑time reasoning, robust fallback logic, and advanced browser automation.

We appreciate your time, effort, and creativity.
