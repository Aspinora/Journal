# Step 1: baseline and acceptance checks

Source baseline: `fdec39514346f90fd9785d9ca544dd2cbfd52c19` (29 September 2026).
Scope: Aspinora/Journal. Admin dashboard changes and Cloudflare R2 are excluded.

This commit adds documentation, synthetic fixture definitions and an offline smoke test only. It does not repair or change application behavior, create accounts, seed the live database, or deploy the earlier repair patch. A private public-schema metadata checkpoint was captured separately; database policies, function bodies and user data are not published in this document.

## Page and data map

| Surface | Entry points / responsibility | Main dependencies |
| --- | --- | --- |
| index.html | Guest home, authentication, compatibility reader | Auth, profiles, journals and public read functions |
| userpostlogin.html | Member feed, categories, saved works, draft/published lists | Auth, journals, structured feed, profiles, interactions |
| writer-studio.html | New work and `?open=<work-id>` | journals for single-entry works; story_works/volumes/parts/chapters for structured works |
| reader-demo.html | `?id=<work-id>` or `?u=<username>&s=<slug>` | Unified work lookup, author and interactions; handoff to structured reader |
| reader-studio.html | Structured reading by work ID or username/slug | Work/chapter read functions, hierarchy, chapter comments |
| portfolio.html | Author via `?u=<username>` | Profiles, work lists and social interactions |
| thewall.html | Wall | Profiles and wall content/interactions |
| usermessages.html | Conversations | Auth, conversation/message functions, blocks and reports |
| 404.html | Clean-path compatibility redirect | index.html route restoration |
| journal-policies.html | Product policy reference | No policy text changes in this step |

The admin dashboard is a shared-backend consumer. Preserve existing table/function contracts when later phases are implemented. Do not delete legacy reader/editor code until callers and compatibility paths are covered.

## Intended behavior by content type

| Type | Structures to cover | Acceptance requirement |
| --- | --- | --- |
| Journal | Single and multiple entries | All entries and body text survive reload; correct category |
| Story | Direct chapters, volumes, parts | Stable order and correct published chapter navigation |
| Article | Simple and structured | Correct reader and category for either structure |
| Poetry | Single entry | Line breaks, alignment and supported formatting survive |
| Shayari | Single entry | Hindi/Urdu/RTL, line breaks and Unicode survive |
| Thought | Single entry | Short text and metadata survive |

For every structure, cover draft and published states with private, unlisted and public visibility where supported. Fixtures in `tests/fixtures/workflows.json` are specifications, not seeded database records.

## First manual baseline run

Use content you can safely discard. Use an owner account, another account you control, and a logged-out/incognito browser. No test accounts have been created automatically. Record browser, viewport, account role and exact error; redact email addresses, access tokens and private content from shared evidence.

| ID | Check | Expected target behavior |
| --- | --- | --- |
| B01 | Load Home; open a work | Correct content appears without literal HTML |
| B02 | Refresh that work; use browser Back/Forward | Work survives refresh; navigation returns to the expected screen |
| B03 | Open Writer Studio while logged out, then sign in | Return to Writer Studio and requested work |
| B04 | Create a private single-entry Journal; type a unique sentence, save and reload | Title and sentence persist |
| B05 | Create a private multiple-entry Journal | Creation succeeds; first entry opens and survives reload |
| B06 | Create/save a private draft for Story, Article, Poetry, Shayari and Thought | Correct type, structure and formatting persist |
| B07 | Open an existing public work by ID, then use its Back button | Correct reader and sensible return destination |
| B08 | Open an owner's private draft link in incognito and another controlled account | Draft text is unavailable; avoid copying private URLs into public bug reports |
| B09 | At phone, tablet and desktop sizes, open editor, reader and a dialog | No hidden controls or unintended horizontal scrolling |
| B10 | Switch between two drafts with unsaved text; reload | No cross-work text mix-up or false saved indicator |

B01-B05 contain known failing paths from the audit. Step 1 does not claim to fix them. Record actual outcomes as PASS, FAIL or BLOCKED; do not mark a case passed because the offline smoke test passes.

## Offline checks

Run `node --test tests/baseline.test.cjs` with Node.js 18 or newer. It checks script syntax, local file references and essential route files without opening a browser, contacting Supabase or changing data. The admin dashboard is excluded from the test inputs.

These checks do not establish authorization correctness, SQL behavior, rendering, responsiveness, or save/publish reliability. Later repair commits must add regression tests for their actual behavior.

## Repair release gate

Each later change needs: a focused diff; regression coverage for the failing behavior; owner/other-user/guest checks when data access changes; compatible database/frontend ordering; a rollback plan; and a post-release smoke test.

Keep schema changes additive until old callers are migrated. Do not remove or weaken foreign keys to hide a client save-order problem. Keep security findings and database checkpoints out of public documentation.

## Rollback

Revert this documentation/test-only commit if necessary. It has no database changes to reverse and modifies no application HTML, assets or dashboard files.
