# Security

- Anthropic API key server-side only — never on the client
- Zod validation on every `createServerFn` via `.validator()`
- Role-based permission check on every mutation
- Never log sensitive data
