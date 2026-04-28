Below is a practical, comprehensive guide for using **Functions / Function Calling** in the OpenAI “ChatGPT API” style workflow.

The modern name is usually **tool calling**. A **function** is one kind of tool: you define a JSON schema, the model decides when to call it, and your backend executes the real code. The model does **not** directly run your function; it returns a structured request asking your app to run it. OpenAI describes this as a multi-step flow: send tools, receive a tool call, execute app-side code, send the tool result back, then receive the final answer. ([OpenAI Platform][1])

---

# 1. What “Functions” are actually for

Use functions when the model needs to interact with something outside its own text generation:

```txt
User → "Do we have iPhone 16 Pro Max in stock?"

Model cannot know your live inventory.
So it calls:

check_inventory({
  "product": "iPhone 16 Pro Max",
  "branch": "all"
})

Your backend queries DB/SAP/CRM.
Then you send the result back to the model.
Model answers naturally.
```

Good use cases:

```txt
Database queries
CRM lookups
SAP / ERP access
Order creation
Refund requests
Calendar scheduling
Sending Telegram messages
Getting weather / exchange rates / stock
Searching internal docs
Running deterministic business logic
Calling your own microservices
```

Bad use cases:

```txt
Pure formatting
Simple reasoning the model can do itself
Anything where you secretly expect the model to “execute code”
Sensitive destructive actions without confirmation
Passing huge data when a function can fetch it by ID
```

---

# 2. Modern API choice: Responses API vs Chat Completions

For new text-generation apps, OpenAI recommends the **Responses API** over the older Chat Completions API, especially for reasoning models. ([OpenAI Platform][2])

You will still see two patterns:

## Newer Responses API style

```ts
const response = await client.responses.create({
  model: "gpt-5.5",
  input: "What's the weather in Tashkent?",
  tools: [
    {
      type: "function",
      name: "get_weather",
      description: "Get current weather for a city.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "City name, e.g. Tashkent"
          }
        },
        required: ["city"],
        additionalProperties: false
      }
    }
  ]
});
```

## Older Chat Completions style

```ts
const completion = await client.chat.completions.create({
  model: "gpt-4.1",
  messages: [
    { role: "user", content: "What's the weather in Tashkent?" }
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "get_weather",
        description: "Get current weather for a city.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "City name, e.g. Tashkent"
            }
          },
          required: ["city"],
          additionalProperties: false
        }
      }
    }
  ]
});
```

The older `function_call` field is deprecated in favor of `tool_calls` in Chat Completions. ([OpenAI Platform][3])

---

# 3. The core lifecycle

Function calling is not one API request. It is usually a loop:

```txt
1. User asks something.
2. You send user input + available tools to the model.
3. Model either:
   a) answers directly, or
   b) returns one or more function calls.
4. Your app parses the function call arguments.
5. Your app validates them.
6. Your app executes the real function.
7. Your app sends the function output back to the model.
8. Model produces final user-facing answer.
9. Repeat if the model asks for more tool calls.
```

OpenAI’s docs explicitly note that a response may include zero, one, or multiple function calls, so your code should handle several calls, not only one. ([OpenAI Platform][1])

---

# 4. Anatomy of a function schema

A function schema tells the model:

```txt
Function name
Description
Expected parameters
Parameter types
Required fields
Allowed enum values
Whether extra unknown fields are forbidden
```

Example:

```ts
const tools = [
  {
    type: "function",
    name: "check_product_availability",
    description:
      "Check whether a specific Apple product is available in one or more Probox branches.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        product_name: {
          type: "string",
          description:
            "Exact or approximate product name, e.g. 'iPhone 16 Pro Max 256GB'."
        },
        color: {
          type: ["string", "null"],
          description:
            "Requested color if mentioned by user, otherwise null."
        },
        branch: {
          type: "string",
          enum: ["all", "chilonzor", "yunusobod", "sergeli"],
          description:
            "Branch to check. Use 'all' if the user did not specify a branch."
        }
      },
      required: ["product_name", "color", "branch"],
      additionalProperties: false
    }
  }
];
```

With `strict: true`, OpenAI recommends schemas where every object has `additionalProperties: false`, and all fields in `properties` are listed in `required`; optional values should usually be represented with a union type that includes `null`. ([OpenAI Platform][1])

---

# 5. Why `strict: true` matters

Use:

```ts
strict: true
```

for nearly every production function.

It makes the model’s arguments reliably follow your schema instead of being “best effort.” OpenAI recommends enabling strict mode, with the requirements mentioned above. ([OpenAI Platform][1])

Bad non-strict output risk:

```json
{
  "productName": "iPhone",
  "location": "Tashkent",
  "urgent": true
}
```

Your function expected:

```json
{
  "product_name": "...",
  "branch": "..."
}
```

Strict mode reduces this class of errors, but you should still validate arguments in your backend. The Chat Completions reference warns that generated function arguments may not always be valid JSON and may include hallucinated parameters, so validation remains necessary. ([OpenAI Platform][3])

---

# 6. Complete TypeScript example: Responses API

This is the cleaner modern pattern.

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

type WeatherArgs = {
  city: string;
  units: "celsius" | "fahrenheit";
};

async function getWeather(args: WeatherArgs) {
  // Replace this with real API/database logic.
  return {
    city: args.city,
    temperature: 18,
    units: args.units,
    condition: "clear"
  };
}

const tools = [
  {
    type: "function" as const,
    name: "get_weather",
    description: "Get current weather for a city.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City and country, e.g. Tashkent, Uzbekistan"
        },
        units: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "Temperature unit."
        }
      },
      required: ["city", "units"],
      additionalProperties: false
    }
  }
];

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid JSON arguments from model");
  }
}

async function run() {
  let input: any[] = [
    {
      role: "user",
      content: "What's the weather in Tashkent in Celsius?"
    }
  ];

  while (true) {
    const response = await client.responses.create({
      model: "gpt-5.5",
      input,
      tools
    });

    const functionCalls = response.output.filter(
      (item: any) => item.type === "function_call"
    );

    if (functionCalls.length === 0) {
      console.log(response.output_text);
      break;
    }

    input = [...input, ...response.output];

    for (const call of functionCalls) {
      const args = safeJsonParse(call.arguments) as WeatherArgs;

      if (call.name === "get_weather") {
        const result = await getWeather(args);

        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result)
        });
      } else {
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            error: `Unknown function: ${call.name}`
          })
        });
      }
    }
  }
}

run().catch(console.error);
```

In the Responses API, function call outputs are sent back as input items with `type: "function_call_output"`, a `call_id`, and an `output`; the output may be a string, text/image/file content array, and JSON strings are commonly used. ([OpenAI Platform][4])

---

# 7. Complete TypeScript example: Chat Completions API

Use this if your existing project already uses `chat.completions.create`.

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function getWeather(city: string, units: "celsius" | "fahrenheit") {
  return {
    city,
    temperature: 18,
    units,
    condition: "clear"
  };
}

const tools = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get current weather for a city.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "City and country, e.g. Tashkent, Uzbekistan"
          },
          units: {
            type: "string",
            enum: ["celsius", "fahrenheit"],
            description: "Temperature unit."
          }
        },
        required: ["city", "units"],
        additionalProperties: false
      }
    }
  }
];

async function run() {
  const messages: any[] = [
    {
      role: "user",
      content: "What's the weather in Tashkent in Celsius?"
    }
  ];

  while (true) {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1",
      messages,
      tools
    });

    const message = completion.choices[0].message;
    messages.push(message);

    const toolCalls = message.tool_calls ?? [];

    if (toolCalls.length === 0) {
      console.log(message.content);
      break;
    }

    for (const toolCall of toolCalls) {
      const name = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      let result: unknown;

      if (name === "get_weather") {
        result = await getWeather(args.city, args.units);
      } else {
        result = { error: `Unknown function: ${name}` };
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }
  }
}

run().catch(console.error);
```

In Chat Completions, tool calls appear in `message.tool_calls`; each call has an `id`, a function `name`, and JSON-encoded `arguments`. You then respond with a `role: "tool"` message that includes the matching `tool_call_id`. ([OpenAI Platform][1])

---

# 8. Tool choice control

By default, the model decides whether to call zero, one, or multiple tools. You can control this with `tool_choice`. OpenAI documents these common modes: `auto`, `required`, a forced specific function, allowed tool subsets, and `none`. ([OpenAI Platform][1])

Examples:

```ts
// Let model decide
tool_choice: "auto"
```

```ts
// Force at least one tool call
tool_choice: "required"
```

```ts
// Force one exact function
tool_choice: {
  type: "function",
  name: "get_weather"
}
```

```ts
// Prevent tool use
tool_choice: "none"
```

When building business flows, this matters a lot.

Example:

```txt
User: "Place order for iPhone 16 Pro Max"

Bad:
Immediately call create_order.

Better:
1. call check_inventory
2. call calculate_price
3. ask user for confirmation
4. only then call create_order
```

---

# 9. Parallel function calling

The model may call multiple functions in one turn. Example:

```txt
User: "Check weather in Paris and Tashkent, then email me the result."

Possible calls:
- get_weather({ city: "Paris" })
- get_weather({ city: "Tashkent" })
- send_email(...)
```

You can disable this by setting:

```ts
parallel_tool_calls: false
```

OpenAI notes that models may choose multiple function calls in a single turn, and `parallel_tool_calls: false` ensures zero or one tool is called. ([OpenAI Platform][1])

Production advice:

```txt
Enable parallel calls for read-only operations:
- search
- fetch
- get weather
- check inventory

Disable parallel calls for workflows requiring order:
- create payment
- reserve item
- issue refund
- delete account
- send message
```

---

# 10. Designing good functions

OpenAI recommends clear function names, clear parameter descriptions, enum/object structures that make invalid states difficult, and keeping the initial function set small. They also suggest aiming for fewer than 20 functions available at the start of a turn as a soft guideline. ([OpenAI Platform][1])

## Bad function

```ts
{
  name: "handle",
  description: "Handles user request",
  parameters: {
    type: "object",
    properties: {
      data: { type: "string" }
    }
  }
}
```

The model has no idea what this function really does.

## Good function

```ts
{
  name: "check_installment_options",
  description:
    "Check available installment plans for a specific product and customer phone number. Use this only after the customer has selected a product.",
  parameters: {
    type: "object",
    properties: {
      product_id: {
        type: "string",
        description: "Internal product UUID from product search results."
      },
      customer_phone: {
        type: "string",
        description: "Customer phone number in +998XXXXXXXXX format."
      },
      duration_months: {
        type: ["integer", "null"],
        enum: [3, 6, 12, 24, null],
        description:
          "Requested installment duration. Use null if user has not specified."
      }
    },
    required: ["product_id", "customer_phone", "duration_months"],
    additionalProperties: false
  },
  strict: true
}
```

---

# 11. Function naming rules

Use names like backend API endpoints:

```txt
get_user_profile
search_products
check_inventory
create_order_draft
confirm_order
cancel_order
send_telegram_message
calculate_installment_plan
```

Avoid vague names:

```txt
process
handle
do_action
run
execute
call_api
```

The model chooses functions mostly from names, descriptions, and parameter schemas. Make the function name self-explanatory.

---

# 12. Parameter design rules

Prefer specific typed fields:

```ts
{
  product_id: string;
  branch_id: string;
  quantity: number;
}
```

Avoid one giant prompt-like field:

```ts
{
  request: string;
}
```

Use enums wherever possible:

```ts
status: {
  type: "string",
  enum: ["pending", "approved", "rejected", "cancelled"]
}
```

Use nullable fields for optional values in strict mode:

```ts
color: {
  type: ["string", "null"],
  description: "Requested color, or null if not specified."
}
```

Do not ask the model to provide values your code already knows. OpenAI specifically recommends offloading burden from the model and not making it fill arguments that your application already has. ([OpenAI Platform][1])

Bad:

```ts
submit_refund({
  order_id: "...", // your UI already knows this
  user_id: "..."   // your auth already knows this
})
```

Better:

```ts
submit_refund({
  reason: "Item arrived damaged"
})
```

Then your backend injects `order_id` and `user_id` from trusted state.

---

# 13. Tool output design

Your function output should be easy for the model to transform into a user answer.

Bad output:

```txt
OK
```

Better output:

```json
{
  "status": "available",
  "product": "iPhone 16 Pro Max 256GB",
  "branches": [
    {
      "name": "Chilonzor",
      "quantity": 3,
      "price_uzs": 18500000
    },
    {
      "name": "Yunusobod",
      "quantity": 1,
      "price_uzs": 18600000
    }
  ]
}
```

For no-result cases:

```json
{
  "status": "not_available",
  "product": "iPhone 16 Pro Max 256GB",
  "alternatives": [
    "iPhone 16 Pro 256GB",
    "iPhone 15 Pro Max 256GB"
  ]
}
```

For errors:

```json
{
  "status": "error",
  "error_code": "SAP_TIMEOUT",
  "user_safe_message": "Inventory system is temporarily unavailable."
}
```

Do not expose internal stack traces to the model unless you are in a debugging-only environment.

---

# 14. Security rules

Treat function calls like requests from an untrusted client.

Always:

```txt
Validate JSON arguments
Check function name against an allow-list
Validate types with Zod / Joi / Pydantic
Enforce auth and permissions server-side
Never trust user_id / role / price from model arguments
Apply rate limits
Use idempotency keys for writes
Log tool calls
Require confirmation before destructive actions
```

Never expose secrets through tool outputs:

```txt
API keys
Database URLs
JWT secrets
Internal admin tokens
Stack traces with env vars
Private user data not needed for the answer
```

For destructive functions, use a two-step pattern:

```txt
1. create_order_draft(...)
2. Ask user: "Confirm order?"
3. confirm_order(draft_id)
```

Do not let the model directly call:

```txt
charge_card
delete_account
send_money
issue_refund
publish_post
send_email_to_customer
```

without explicit confirmation logic.

---

# 15. Production-grade function router pattern

Use a registry instead of `if/else` chaos.

```ts
type ToolHandler = (args: unknown, context: RequestContext) => Promise<unknown>;

type RequestContext = {
  userId: string;
  role: "customer" | "admin" | "super_admin";
  requestId: string;
};

const toolRegistry: Record<string, ToolHandler> = {
  get_weather: async (args) => {
    // validate with Zod here
    return {
      city: "Tashkent",
      temperature: 18,
      units: "celsius"
    };
  },

  search_products: async (args, context) => {
    // context.userId comes from auth, not the model
    return [];
  }
};

async function executeToolCall(
  name: string,
  rawArgs: string,
  context: RequestContext
) {
  const handler = toolRegistry[name];

  if (!handler) {
    return {
      status: "error",
      error_code: "UNKNOWN_TOOL",
      message: `Tool ${name} is not available.`
    };
  }

  let args: unknown;

  try {
    args = JSON.parse(rawArgs);
  } catch {
    return {
      status: "error",
      error_code: "INVALID_JSON",
      message: "Tool arguments were not valid JSON."
    };
  }

  try {
    return await handler(args, context);
  } catch (error) {
    console.error("Tool execution failed", {
      name,
      requestId: context.requestId,
      error
    });

    return {
      status: "error",
      error_code: "TOOL_EXECUTION_FAILED",
      message: "The tool failed while processing the request."
    };
  }
}
```

---

# 16. Example: CRM / Apple store assistant

For your kind of backend/CRM use case, a strong tool set could look like this:

```ts
const tools = [
  {
    type: "function",
    name: "search_products",
    description:
      "Search Apple products by model, storage, color, category, and approximate query.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "User's product query, e.g. 'iPhone 16 Pro Max 256GB'."
        },
        category: {
          type: ["string", "null"],
          enum: ["iphone", "macbook", "ipad", "watch", "airpods", "accessory", null],
          description: "Product category if obvious, otherwise null."
        }
      },
      required: ["query", "category"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "check_inventory",
    description:
      "Check stock availability for a product ID across Probox branches.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "Internal product ID returned by search_products."
        },
        branch: {
          type: "string",
          enum: ["all", "chilonzor", "yunusobod", "sergeli"],
          description: "Branch to check. Use all if not specified."
        }
      },
      required: ["product_id", "branch"],
      additionalProperties: false
    }
  },
  {
    type: "function",
    name: "calculate_installment",
    description:
      "Calculate installment options for a product. Use only after product and price are known.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "Internal product ID."
        },
        months: {
          type: ["integer", "null"],
          enum: [3, 6, 12, 24, null],
          description: "Requested duration, or null if user did not specify."
        }
      },
      required: ["product_id", "months"],
      additionalProperties: false
    }
  }
];
```

Flow:

```txt
User: "iPhone 16 Pro Max bormi?"

Model:
search_products({ query: "iPhone 16 Pro Max", category: "iphone" })

Backend returns product IDs.

Model:
check_inventory({ product_id: "prod_123", branch: "all" })

Backend returns stock.

Model final:
"Ha, iPhone 16 Pro Max hozir Chilonzor filialida 3 dona, Yunusobod filialida 1 dona bor..."
```

---

# 17. Common mistakes

## Mistake 1: Expecting the model to execute the function

Wrong mental model:

```txt
I define get_weather, so OpenAI runs it.
```

Correct:

```txt
OpenAI returns a request to call get_weather.
My backend runs get_weather.
I send the result back.
```

## Mistake 2: Forgetting the second request

Bad:

```ts
const response = await client.responses.create({ input, tools });
console.log(response.output_text); // empty or incomplete because model called a tool
```

Correct:

```ts
// detect function_call
// execute function
// send function_call_output
// then read final output_text
```

## Mistake 3: Too many tools at once

Huge tool lists reduce accuracy and increase token cost. Function definitions are injected into the model context and count as input tokens; OpenAI suggests limiting loaded functions, shortening descriptions where possible, or using tool search for deferred tools. ([OpenAI Platform][1])

## Mistake 4: Weak schemas

Bad:

```ts
parameters: {
  type: "object",
  properties: {
    data: { type: "string" }
  }
}
```

Good:

```ts
parameters: {
  type: "object",
  properties: {
    product_id: { type: "string" },
    quantity: { type: "integer", minimum: 1 },
    branch: { type: "string", enum: ["chilonzor", "yunusobod"] }
  },
  required: ["product_id", "quantity", "branch"],
  additionalProperties: false
}
```

## Mistake 5: Letting model choose sensitive arguments

Bad:

```ts
{
  user_id: { type: "string" },
  role: { type: "string" },
  discount_percent: { type: "number" }
}
```

Better:

```txt
Get user_id from auth.
Get role from database.
Calculate discount server-side.
```

---

# 18. Practical checklist

Before shipping function calling to production:

```txt
[ ] Every function has a clear name.
[ ] Every function has a detailed description.
[ ] Every parameter has a description.
[ ] Enums are used where possible.
[ ] strict: true is enabled.
[ ] additionalProperties: false is set.
[ ] All strict-mode fields are required.
[ ] Nullable fields use ["type", "null"].
[ ] Backend validates arguments.
[ ] Function names are allow-listed.
[ ] Tool outputs are JSON and user-safe.
[ ] Destructive actions require confirmation.
[ ] Logs include request_id, tool name, args summary, duration, result status.
[ ] Parallel tool calls are disabled for ordered workflows.
[ ] You tested no-tool, one-tool, multi-tool, invalid-args, and tool-error cases.
```

---

# 19. The cleanest mental model

Think of the model as a smart API planner:

```txt
The model decides:
"What function should be called, and with what arguments?"

Your backend decides:
"Is this function allowed? Are arguments valid? What does the real system return?"

The model then decides:
"How should I explain the result to the user?"
```

That separation is the key to building reliable AI agents.

[1]: https://platform.openai.com/docs/guides/function-calling "Function calling | OpenAI API"
[2]: https://platform.openai.com/docs/guides/text-generation "Text generation | OpenAI API"
[3]: https://platform.openai.com/docs/api-reference/chat-streaming/streaming?ref=createwithswift.com "Chat | OpenAI API Reference"
[4]: https://platform.openai.com/docs/api-reference/responses/create "Create a model response | OpenAI API Reference"
