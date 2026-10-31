# Fair Hygiene for Jira: privacy policy

_Last updated 31 October 2026._

Fair Hygiene for Jira is a Forge app that runs entirely on Atlassian's platform. It has no servers
of its own and sends no data outside Atlassian (no egress is declared in its manifest).

**What it reads.** With read-only scopes (`read:jira-work`, `read:jira-user`), it reads the issues of
the Jira project where it is opened: fields, comments, worklogs, attachments' metadata and history,
to compute the weekly report. Reports are computed on request and are not stored.

**What it stores** (Forge storage, inside Atlassian, scoped to the installation):
- per-project settings (time zone, gate, labels and similar);
- verdicts on review items: the decision, a one-sentence reason and a timestamp, keyed by a hash;
- for under 24 hours, the evidence bundle sent to the model for a pending item (the issue's fields
  and comment text, with people shown only as roles such as "assignee").
It stores no Atlassian account IDs, names or email addresses.

**AI.** Notes that need a judgement are sent to Claude through Atlassian's Forge LLMs service, which
runs on Atlassian-managed infrastructure. Only the evidence bundle described above is sent, and only
when a user clicks "Judge with Claude".

**Who can see what.** Every request checks the signed-in user's own permission in the project:
browsing the project to see a report, administering it to change settings or overrule a verdict.

**Removal.** Uninstalling the app deletes its Forge storage for that site.

**Contact.** Questions: open an issue at https://github.com/nicappave/fair-hygiene-for-jira/issues.
