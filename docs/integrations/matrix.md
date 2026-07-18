---
purpose: Summarise providers, permissions, ownership, and failure states.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Integration matrix

| Provider/capability   | Identity                         | Permission                                                         | Data flow in WP-07                                           | Failure state                            | Status                                 |
| --------------------- | -------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------- | -------------------------------------- |
| Microsoft connection  | Personal account via `consumers` | `openid profile offline_access User.Read Calendars.Read` delegated | OAuth code/PKCE, `/me` ID and display name, encrypted tokens | disconnected or reauthorization required | Complete; live grant/disconnect passed |
| Outlook calendar read | Same connection                  | `Calendars.Read` delegated                                         | None in WP-07                                                | Not applicable                           | Deferred to WP-12                      |
| Calendar write        | None                             | None                                                               | None                                                         | Not applicable                           | Not approved                           |
| Mail                  | None                             | None                                                               | None                                                         | Not applicable                           | Not approved                           |
| Microsoft To Do       | None                             | None                                                               | None                                                         | Not applicable                           | WP-11 gate; not approved               |
| Shared calendars      | None                             | None                                                               | None                                                         | Not applicable                           | Not approved                           |
| Application access    | None                             | None                                                               | None                                                         | Not applicable                           | Not approved                           |

Provider tokens are never returned through Meridian APIs. Local access remains
available when Microsoft is unconfigured, unavailable, disconnected, or revoked.
