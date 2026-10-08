# 04 — Release Notes (v1.0.0, for non-technical stakeholders)

**TaskHub is ready for its first client handover.** Teams can sign up, organise work
into organisations, and manage todos with confidence that nothing gets silently lost
or seen by the wrong people.

What changed in this release:
- **Fixed: task list could show the wrong status after fast clicking.** Tapping a
  task's Done/undo button rapidly no longer confuses the screen — it now always
  settles on the true state and explains itself if something changed underneath you.
- **New: automatic archiving.** Finished tasks older than 30 days (configurable) tidy
  themselves out of the daily list but stay findable and restorable — spring cleaning
  without the shredder.
- **New: sign-in abuse protection.** Repeated automated sign-in attempts are now
  slowed down automatically, while normal sign-ins are unaffected.

Behind the scenes: full audit trail for membership and task changes (visible to
organisation admins), safe data storage that survives crashes, import/export for
client handovers, and automated checks that run on every change.

Known limitations: single-server deployment, no email invites yet, no mobile app.
See README "Known limitations & next steps".
