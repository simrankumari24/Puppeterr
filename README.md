### Puppeterr
PROJECT OVERVIEW
This project implements a browser‑automation agent composed of four cooperating modules: Planner, Instinct, Reasoner, and Vision. The system is designed to execute tasks inside a browser environment while providing real‑time reasoning, human guidance, and runtime logging. The goal is to approximate a guided autonomous workflow similar to Devin-style agents.

MODULES
Planner
Executes step-by-step actions such as clicking, filling inputs, submitting forms, and navigating pages. Planner is responsible for interpreting tasks and producing actionable steps. It may enter fallback loops when selectors fail or page state changes unexpectedly.

Instinct
Monitors Planner’s behavior and detects confusion, repeated failures, invalid selectors, or stalled progress. Instinct can escalate warnings and request human intervention. It acts as a safety layer to prevent infinite loops or runaway behavior.

Reasoner
Generates natural-language explanations of what the agent is doing. It can request guidance from the user and respond to user-provided steering. Reasoner is the communication layer between the autonomous system and the human operator.

Vision
Captures page state, extracts DOM information, identifies visible elements, and provides context for Planner and Reasoner. Vision helps the agent understand what is currently on the screen.

FEATURES

Real-time reasoning output

Human-in-the-loop guidance via /api/guidance

Runtime event logging

Selector fallback logic

Basic confusion detection

Modular architecture for browser automation

Support for manual interruption and recovery

SETUP
Clone the repository.
Install dependencies.
Start the development server.
Run the agent in a browser-enabled environment.

API ENDPOINTS
POST /api/guidance
Accepts a JSON body containing a "text" field. This endpoint delivers user guidance to the Reasoner module.

POST /api/runtime
Logs runtime events from Planner, Instinct, and Reasoner.

GET /api/status
Returns the current agent state.

KNOWN ISSUES
Planner may generate invalid selectors during fallback attempts.
Browser contexts may close unexpectedly if interrupted manually.
Guidance requests require correct JSON formatting.
Selector mutation may produce syntactically invalid CSS.
Certain pages (such as Bing’s homepage) cause repeated fill failures.

FUTURE WORK
Improve selector sanity checks.
Add a structured Reasoner live-stream panel.
Implement a more robust Reality Bonk Gate for Planner.
Enhance Vision’s DOM interpretation.
Add better debugging tools and UI overlays.

use "sudo find / -type f -iname "*chrome*" 2>/dev/null" fr a full nuke search and

"npx playwright install chromium" if u dont find it anyway

