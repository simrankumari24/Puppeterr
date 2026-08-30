# Project Pitch Draft

## Technical Innovation

Autonomous browser agents (used for research automation, accessibility tools,
and enterprise workflow automation) fail in production at rates far higher
than published benchmarks suggest — one recent industry analysis found an
agent scoring 78% on the WebArena benchmark completed only 22% of real
transactions in production. The gap is not model capability; it is the
absence of a rigorous methodology for distinguishing *why* an agent fails on
the live, adversarial web: infrastructure failure, reasoning failure, or
active anti-automation defense — each of which requires a fundamentally
different engineering response.

This project investigates whether autonomous web agents can be instrumented
to (1) accurately self-report task outcomes without relying on the agent's
own unverified judgment, and (2) automatically classify failure into
distinct, actionable categories in real time, closing the gap between
benchmark performance and real-world reliability.

## Technical Objectives and Challenges (the high-risk research question)

Preliminary instrumentation on our working prototype (n=46 live web tasks,
non-benchmark, adversarial conditions) surfaced the core open problem
directly: **agent self-reported success and independently-verified success
matched in only 70.4% of cases where a verification signal existed at all
(19/27 diagnosis events)** — and a substantial fraction of task attempts
(9/46, ~20%) terminated with no outcome record whatsoever due to
unhandled infrastructure failures, a category of failure invisible to
standard benchmark evaluation entirely.

Three specific technical risks, each with a real chance of a negative
result:

1. **Self-verification reliability**: Can an agent's own claimed-success
   signal be corrected to ground truth using only signals internal to the
   task execution trace (action failure streaks, retry patterns), without
   external human labeling? Our preliminary discrepancy rate (0% in this
   sample, n=27) is too small to establish whether this holds at scale, or
   whether larger samples reveal systematic self-assessment bias.

2. **Failure-mode separability**: Can infrastructure failure (process
   crashes, resource exhaustion), reasoning failure (wrong action chosen),
   and active detection/defense (CAPTCHA walls, structural blocking) be
   reliably distinguished automatically, in real time, from the execution
   trace alone — without per-site hand-tuned heuristics that don't
   generalize? Preliminary data shows highly non-uniform, site-specific
   failure clustering (0% completion on 4 of 13 distinct hosts sampled,
   100% on 5 of 13), suggesting failure is structurally site-dependent in
   ways not yet well characterized in the literature.

3. **Behavioral realism as a measurable variable**: Does agent action
   timing/motion realism have a measurable, generalizable relationship to
   task reliability across sites, or is any such effect fundamentally
   non-transferable (site-specific, arms-race, decaying over time)? This
   is currently unknown and untested at any rigorous scale in published
   work.

We do not know the answers to any of these — that is the basis of the
proposed R&D. A negative result (e.g., self-verification cannot be
corrected without human-in-the-loop labeling; failure modes are not
separable without site-specific tuning) is a genuine, publishable, and
commercially relevant outcome, not a failure of the project.

## Preliminary Data (methodology validation, not performance claim)

Current instrumentation (built during this reporting period) captures,
per task: step-level action outcome (87.9% raw step success across 290
logged actions), fallback/retry path taken, per-host completion,
CAPTCHA/challenge incidence (8.1% of ended tasks), and a claimed-vs-actual
success discrepancy signal. This confirms the measurement methodology is
implementable and produces structured, analyzable data — the necessary
precondition for the proposed research questions above. Sample size
(n=46) is a pilot scale; Phase I work would expand this to a
statistically powered, multi-site, repeated-trial benchmark suite.

## Commercial Opportunity

A validated methodology for (1) trustworthy agent self-verification and
(2) automatic failure-mode classification is directly applicable beyond
this prototype — to any autonomous web/computer-use agent deployed in
production, a rapidly growing market (enterprise browser automation,
QA testing, accessibility tooling, research data collection). Today,
teams building these agents have no standard way to know, at scale,
whether a failure is worth engineering effort to fix or is an
unavoidable site-specific block — this project's output would be that
standard.
