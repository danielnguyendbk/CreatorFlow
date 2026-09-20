# CreatorFlow

Monorepo workspace for CreatorFlow.

## Current priority

**Frontend first**

Start in:

```text
CreatorFlow-Frontend/
```

## Workspace

```text
CreatorFlow/
├── .claude/
│   ├── commands/
│   ├── hooks/
│   ├── plans/
│   ├── references/
│   ├── rules/
│   └── skills/
├── certs/
├── docs/
├── CreatorFlow-Backend/
├── CreatorFlow-Frontend/
├── CreatorFlow-Infra/
├── CreatorFlow-Mcp/
└── CreatorFlow-Mobile/
```

## Modules

- `CreatorFlow-Frontend`: current focus.
- `CreatorFlow-Backend`: Java/Spring Boot backend.
- `CreatorFlow-Infra`: Docker, deployment, observability, CI/CD.
- `CreatorFlow-Mcp`: future MCP/tool integrations.
- `CreatorFlow-Mobile`: optional future mobile client.
- `docs`: business, product and architecture docs.
- `.claude`: AI coding context, rules, plans, commands and skills.
