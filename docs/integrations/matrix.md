---
purpose: Summarise providers, permissions, ownership, and failure states.
audience: Owner, contributors, and coding agents.
authoritative-for: The scope described by this document once its governing work package activates it.
update-triggers: Its related capability, schema, contract, decision, or operational process changes.
related-docs: ../README.md
---

# Integration matrix

| Provider/capability        | Identity                         | Permission                                                         | Meridian boundary                                              | Failure state                            | Status                                         |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Microsoft connection       | Personal account via `consumers` | `openid profile offline_access User.Read Calendars.Read` delegated | Historical WP-07 connection and encrypted-token custody        | disconnected or reauthorization required | WP-07 complete; further live work paused       |
| Outlook calendar read      | Same connection                  | `Calendars.Read` delegated                                         | Provider-neutral `CalendarPort`; no WP-12 adapter on `main`    | local agenda remains available           | Deferred; inactive                             |
| Calendar write             | None                             | None                                                               | Future `CalendarPort` adapter only after exact approval        | local proposal remains internal          | Deferred; not approved                         |
| Microsoft To Do            | Experimental branch only         | No new permission is authorised by `main`                          | Provider-neutral `ReminderDeliveryPort`; canonical local truth | local reminder remains internal          | WP-11 deferred; mocked branch remains unmerged |
| Local agenda blocks        | Local owner                      | None                                                               | Owner-scoped canonical Meridian data                           | fail closed without external projection  | WP-13A complete                                |
| In-app reminder lifecycle  | Local owner                      | None                                                               | Canonical reminders and occurrences                            | never claims external delivery           | WP-13A complete                                |
| Mail                       | None                             | None                                                               | No adapter                                                     | not applicable                           | Not approved                                   |
| Shared Microsoft resources | None                             | None                                                               | No import or mutation                                          | not applicable                           | Not approved                                   |
| Application access         | None                             | None                                                               | No application permission                                      | not applicable                           | Not approved                                   |
| Other external providers   | None                             | None                                                               | Separate governed proposal required                            | local Alpha remains usable               | Not selected or approved                       |

Provider tokens are never returned through Meridian APIs. Local access remains
available when Microsoft is unconfigured, unavailable, disconnected, or revoked.
No production or Alpha capability may assume provider credentials, consent,
account state, or availability.
