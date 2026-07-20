---
purpose: Summarise providers, permissions, ownership, and failure states.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Integration matrix

| Provider/capability   | Identity                         | Permission                                                                                          | Governed data flow                                                | Failure state                            | Status                                  |
| --------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| Microsoft connection  | Personal account via `consumers` | `openid profile offline_access User.Read Calendars.Read` delegated                                  | OAuth code/PKCE, `/me` ID and display name, encrypted tokens      | disconnected or reauthorization required | Complete; live grant/disconnect passed  |
| Outlook calendar read | Same connection                  | `Calendars.Read` delegated                                                                          | None in WP-07                                                     | Not applicable                           | Deferred to WP-12                       |
| Calendar write        | None                             | None                                                                                                | None                                                              | Not applicable                           | Not approved                            |
| Mail                  | None                             | None                                                                                                | None                                                              | Not applicable                           | Not approved                            |
| Microsoft To Do spike | Same personal account            | Proposed incremental `Tasks.ReadWrite` delegated; exact Graph token set adds only `Tasks.ReadWrite` | Dormant dedicated-list adapter and mocked synthetic fixtures only | suspended, uncertain, or unmanaged       | Mocked; live consent/Graph gate pending |
| Shared calendars      | None                             | None                                                                                                | None                                                              | Not applicable                           | Not approved                            |
| Application access    | None                             | None                                                                                                | None                                                              | Not applicable                           | Not approved                            |

Provider tokens are never returned through Meridian APIs. Local access remains
available when Microsoft is unconfigured, unavailable, disconnected, or revoked.
The current connect route still requests the five-scope Stage-A envelope. The
six-scope To Do envelope has no exposed route and is not live-approved.
