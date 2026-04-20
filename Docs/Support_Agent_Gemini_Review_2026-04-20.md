# Support Agent Gemini Review

Date: 2026-04-20

## Scope

This document reviews the current Probox Telegram support-agent workflow, compares it against current official Gemini API guidance, identifies the gaps behind the observed failure mode, and records the implementation changes made in this pass.

## Current Workflow

1. Telegram user sends a support message.
2. `processSupportRequest()` in `src/utils/support/support.util.ts` resolves FAQ routing.
3. If a static FAQ answer is available, the bot replies immediately.
4. If an AI-agent FAQ or fallback AI path is selected, `continueAgentConversation()` loads ticket history and calls `SupportAgentService.generateReply()`.
5. `SupportAgentService.generateReply()`:
   - Detects whether the user likely asked an inventory question.
   - Tries an inventory pre-check with SAP before invoking Gemini.
   - Tries a device-catalog pre-check for broad assortment questions.
   - Serializes FAQ metadata, user profile, transcript, and grounded pre-check data into a prompt.
   - Calls `GeminiService.generateJsonWithTools()` with store, catalog, and currency tools.
6. `GeminiService.generateJsonWithTools()`:
   - Sends prompt + tool declarations + structured-output schema to Gemini.
   - Executes model-requested tools.
   - Caches duplicate tool calls by fingerprint.
   - Feeds function results back into Gemini until JSON is returned or the tool-iteration limit is exceeded.
7. If Gemini returns a grounded reply, the bot sends it to the user and appends it to the ticket.
8. If Gemini fails or escalates, the ticket is forwarded to human support.

## Observed Failure Pattern

The provided trace for `silada 15 pro bomi` showed this sequence:

1. Inventory intent was correctly detected.
2. Slang normalization correctly derived `iphone 15 pro`.
3. SAP pre-check correctly found zero exact matches.
4. Alternative fallback lookup correctly found that the broader `iphone` family had grounded alternatives.
5. Gemini still called `lookup_store_items` again for the same exact query.
6. Gemini then called `lookup_available_devices`.
7. The turn exhausted the tool-iteration budget and escalated to human support.

Root cause: the system had some anti-loop instructions, but it still exposed all tools every time and did not force a grounded final answer when the model stopped making progress.

## Official Gemini Guidance

Relevant official guidance reviewed:

- Function calling best practices:
  - Provide clear role/context and explicit rules for when functions should or should not be used.
  - Encourage clarification when necessary.
  - Check finish reasons.
  - Return informative tool errors.
  - Keep the active tool set focused and relevant.
- Structured output best practices:
  - Use clear schema descriptions.
  - Keep strong typing.
  - Still validate semantic correctness in application code.
- Prompting guidance:
  - Put critical instructions in system instructions.
  - For long contexts, provide context first and task last.
  - Use structured tagging/formatting to separate context from instructions.
  - Agentic prompts benefit from explicit planning/execution/validation priorities.
- Thought signatures:
  - Preserve them across manual REST-based function-calling turns.
- Model guidance:
  - `gemini-2.5-flash` is documented as a strong balanced model for agentic use cases.
  - `gemini-2.5-flash-lite` is optimized more for speed/cost/high-throughput straightforward tasks.

Official sources:

- https://ai.google.dev/gemini-api/docs/function-calling
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/prompting-strategies
- https://ai.google.dev/gemini-api/docs/thought-signatures
- https://ai.google.dev/gemini-api/docs/models/gemini

## Gaps vs Guidance

### 1. Tool set was too broad per turn

The support agent always exposed:

- `lookup_store_items`
- `lookup_available_devices`
- `lookup_currency_rate`
- `convert_currency_amount`

This gave the model more branching opportunities than necessary, even for simple stock questions.

### 2. Prompt policy was too flat

The original system instructions were good but mostly a flat list. They did not strongly separate:

- grounding rules
- output style
- tool policy
- escalation rules

That makes it easier for the model to underweight the “stop and answer now” behavior.

### 3. No runtime recovery when the model stalled

The Gemini wrapper cached duplicate tool calls, but when the model repeated itself it still stayed inside the same tool-enabled loop until the hard iteration cap was reached.

### 4. No lightweight reply cleanup

The system relied fully on prompting for non-repetitive wording without any minimal post-processing guard against duplicate lines.

### 5. Default support model skewed toward cheaper throughput

The support-agent default used `gemini-3.1-flash-lite-preview`, which is less aligned with a high-quality, grounded, multi-step support workflow than the more balanced `gemini-2.5-flash` default now recommended by Google for agentic use cases.

## Plan

1. Restructure the support-agent system instructions into explicit rule groups.
2. Narrow the active tool set dynamically based on the user’s actual intent.
3. Restructure the prompt so context comes first and the task comes last.
4. Add a no-progress recovery path in the Gemini wrapper that forces a final grounded JSON answer instead of failing immediately on duplicate/no-progress tool behavior.
5. Add focused tests to lock in the new behavior.
6. Align the default support-agent model with the more suitable balanced Gemini model.

## Implemented Changes

### Support-agent policy changes

In `src/services/support/support-agent.service.ts`:

- Rewrote system instructions into grouped sections:
  - role
  - language
  - grounding
  - output
  - tool policy
  - inventory
  - currency
  - escalation
- Added explicit anti-hallucination and anti-repetition rules.
- Added CTA guidance so replies can end cleanly without forcing a next step every time.
- Switched prompt structure to:
  - `<context>`
  - grounded data
  - enabled tools for the current turn
  - `<task>`

### Dynamic tool selection

The agent now exposes only the tools relevant for the current turn:

- specific stock question -> `lookup_store_items`
- broad catalog question -> `lookup_available_devices`
- exchange-rate question -> `lookup_currency_rate`
- currency-conversion question -> `convert_currency_amount`

This reduces tool confusion and matches official guidance to keep the active tool set focused.

### Runtime no-progress finalization

In `src/services/gemini.service.ts`:

- `generateJsonWithTools()` now preserves schema + system instructions even when no tools are enabled.
- When the model requests only duplicate tool calls, the wrapper now makes one final tool-disabled structured-output request instructing Gemini to answer from existing grounded context.
- When the iteration budget is exhausted, the wrapper now makes the same finalization attempt before failing.

This changes the failure mode from “loop until escalation” to “answer with the grounded facts already collected whenever possible.”

### Reply cleanup

Added conservative duplicate-line cleanup before returning the final user-facing reply payload.

### Model default

In `src/config/index.ts` the support-agent default was aligned to:

- `gemini-2.5-flash`

This matches Google’s current positioning of that model as a strong balanced choice for agentic workflows.

## Residual Risks

1. Branch-name extraction is still heuristic-light. The model can pass branch names to the inventory tool, but the pre-check itself still does not proactively resolve branch names from free text.
2. The agent still depends on SAP naming/search behavior. If SAP search normalization misses a colloquial phrase, the answer quality will still be constrained by the query derivation layer.
3. The support stack still uses manual REST orchestration for Gemini rather than the official SDK’s higher-level chat abstraction.

## Suggested Next Improvements

1. Add explicit branch-name extraction and branch-aware inventory pre-checks.
2. Add semantic reply QA tests for:
   - unavailable exact item + grounded alternatives
   - broad catalog question
   - store-specific stock question
   - price conversion follow-up after an inventory answer
3. Add telemetry for:
   - tool calls per support turn
   - duplicate tool-call rate
   - finalization-recovery rate
   - AI-to-human escalation rate by reason
