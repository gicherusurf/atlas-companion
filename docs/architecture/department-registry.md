# Atlas Department Registry

## Purpose

The Department Registry is the single source of truth for every
department available in Atlas. Mission Control, the Workflow Engine and
Runner, and future AI Agents never import a department directly — they
ask the registry for what they need, and the registry either returns
department metadata or, for execution, dispatches to the right
department on the caller's behalf.

## Why a Registry Exists

Without a registry, adding a new department would mean touching every
consumer of departments: Mission Control's dashboard code, the Workflow
Runner's step-dispatch logic, and eventually every AI Agent that might
want to invoke one. Each of those would need to `import` the new
department directly, and — worse — would need conditional logic (a
growing `if`/`switch` chain) to decide which department a request was
actually for.

The registry inverts this. A department registers itself once,
describing its own capabilities. Every consumer asks the registry the
same way regardless of which department they actually want:
`departmentRegistry.getDepartment(id)`, or
`departmentRegistry.executeAction({ department, action, ... })`. Adding
department fifty costs the registry nothing more than department five
did, and — critically — costs the Workflow Runner, Mission Control, and
every AI Agent **zero code changes**, since none of them ever grew
department-specific branches to begin with.

## Architecture

The registry stores **department metadata only** — `id`, `name`,
`displayName`, `description`, `version`, `status`, and the list of
`DepartmentCapability` entries a department exposes. It never imports,
and never calls, a department's actual implementation. There is no
`import { seoDepartment } from "@/lib/seo-department"` anywhere in
`department-registry.ts`, and there never should be — not for SEO, not
for any future department.

This is enforced by construction, not just by convention: `Department`
and `DepartmentCapability` (`src/types/department.ts`) describe a
department using plain data (strings, enums, a metadata bag) — there is
no field on either type capable of holding a function reference or a
module import. A department literally cannot be registered in a way that
hands the registry executable code.

**Design rule, stated plainly: the registry owns metadata. Departments
own execution. The registry never executes business logic.**

## Department Lifecycle

A `Department` carries one of four statuses:

- **active** — fully available; its capabilities can be invoked via
  `executeAction()`.
- **experimental** — registered and inspectable, but likely excluded
  from default listings (e.g. `listDepartments()` filtered to `"active"`
  for a production Mission Control view) until it graduates.
- **disabled** — temporarily unavailable without being removed from the
  registry entirely; its metadata is still visible via `getDepartment()`,
  but `executeAction()` is expected to refuse to dispatch to it.
- **deprecated** — still registered (so existing references to it don't
  break outright) but signaling that consumers should migrate away from
  it.

`registerDepartment()` and `unregisterDepartment()` are the only ways a
department enters or leaves the registry. Status transitions between the
four states above are expected to go through `registerDepartment`'s
sibling update path once persistence exists (not yet exposed as its own
method in this sprint — see Future below).

## Capability Lifecycle

A `DepartmentCapability` is one named, versioned action a department
exposes (e.g. `{ name: "Metadata Audit", action: "runMetadataAudit",
version: "1.0" }`). Capabilities are registered as part of a
`Department`'s `capabilities` array — there is no separate
"register a capability" method, since a capability doesn't have
independent existence apart from the department that owns it.

`listCapabilities()` and `getCapability()` exist to let a consumer
reason about "what can Atlas do" across every department at once —
useful for a future Workflow Engine authoring UI — without needing to
already know which department owns the capability it's looking for.

## Workflow Integration

A `WorkflowStep` (`src/types/workflow.ts`) names a `department` and
`action` as plain strings. The Workflow Runner's `runStep()` is
documented to resolve that pair through the Department Registry's
`executeAction()` — never through a direct import of the named
department — which is exactly what keeps
`docs/architecture/workflow-engine.md`'s "Workflow Engine imports
nothing from Departments" rule real at execution time, not just at the
type level. The registry is the mechanism that makes that promise
possible to keep.

## Mission Control Integration

Mission Control's dashboard (`src/lib/mission-control.ts`) is expected to
use `departmentRegistry.listDepartments()` to discover what departments
exist and `getDepartment()` to read a specific department's status,
rather than hardcoding which departments it knows about. This is what
lets Mission Control's Business Health section grow new department cards
(beyond today's placeholder SEO/Content/Marketing cards) automatically
as departments register themselves, without a code change to
`mission-control.tsx` for every new department.

## AI Agent Integration

Future AI Agents are expected to be first-class consumers of the
registry, exactly like Mission Control and the Workflow Runner: an agent
deciding "this business needs its SEO reviewed" calls
`departmentRegistry.executeAction({ department: "seo", action:
"runOverallAudit", ... })` rather than importing the SEO Department
directly. This matters more for agents than for human-driven UI, because
an agent's set of "things it might want to do" is expected to grow and
change dynamically — the registry is what lets an agent discover
capabilities (`listCapabilities()`) it wasn't specifically coded to know
about in advance.

## Future Plugin System

The registry, as built in this sprint, is metadata-only and in-memory
(indeed, not even persisted yet — every write method throws
`TODO(department-registry)`). The full Plugin System described in
`docs/vision/atlas-platform-v2.md` (install → register → initialize →
run → publish insights → shutdown → upgrade) is expected to build on top
of this registry rather than replace it: `registerDepartment()` is the
"register" step of that lifecycle; the "install" and "initialize" steps
are expected to precede a call to `registerDepartment()`, and "shutdown"
is expected to correspond to `unregisterDepartment()` (or a transition to
`status: "disabled"`).

## Future Marketplace

Atlas Enterprise will eventually allow **third-party departments to
register themselves dynamically through this registry**, rather than
every department being built and registered by Atlas's own engineering
organization. Because the registry already treats every department
identically — metadata in, dispatch through `executeAction()`, no
special-cased imports for any particular department — a marketplace
department (built by a construction, healthcare, or logistics partner,
per the examples in `docs/vision/atlas-platform-v2.md`) is architecturally
indistinguishable from a first-party one the moment it calls
`registerDepartment()`. The registry does not need to change at all to
support this; it was built general enough on day one.
