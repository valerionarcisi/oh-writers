# Code Comments

Comment only complex logic — not what the code does, but why it exists and how it works. Self-documenting names first; a comment is a last resort.

```typescript
// Bad — describes what the code does
const active = users.filter((u) => u.status === "ACTIVE");

// Good — explains why this edge case exists
// Suspended users retain read access for 30 days for data export
const accessible = users.filter(
  (u) => u.status === "ACTIVE" || u.status === "SUSPENDED",
);
```
