# Existing-work rendering fix

Writer Studio stores rich HTML in the field also used by legacy Markdown works. The three older reader views sent every body through a Markdown renderer, which escaped HTML tags. These readers now detect Writer HTML and sanitize it with locally bundled DOMPurify 3.4.16; legacy Markdown continues through its existing renderer and is then sanitized.

The structured reader now requests individual published chapters through the existing `get_story_chapters_for_read` RPC. This supports the subsequent database access-control rollout without changing the chapter UI.

No admin dashboard files or storage configuration are changed.

## Automated verification

Run `npm ci` followed by `npm test` on Node 22.12 or newer. The 15 tests cover all three legacy reader paths, rich formatting, Markdown, unsafe markup, inline JavaScript syntax, and the structured-reader RPC contract. These are DOM and mocked-client checks, not a complete live-browser or live-database test.

## Where to test

Use a deployment of this branch first. A local alternative is `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000/`. Existing authentication redirect settings may limit local sign-in, so a configured preview deployment is preferred. The production site changes only after this branch is merged and the hosting deployment succeeds.

1. Open an existing Writer Studio work from the public homepage. Confirm paragraphs, bold/italic text, alignment, images and Urdu/Hindi text render without literal `<p>`, `<span>` or `<br>` tags.
2. Open the same work while signed in and through its direct reader link. Confirm the same result after a hard refresh.
3. Open an older Markdown work. Confirm headings, lists, links and images still work.
4. Open a structured story, switch chapters, reload a chapter and test an unlisted story's direct link.
5. Save a draft edit without publishing. A different account must still see the last published version after the database access migration is deployed.

## Rollout order

Deploy this frontend change before restricting direct chapter-table reads. The database candidate and rollback are kept separately from this public repository. Database verification used synthetic data in local PostgreSQL 18 (PGlite); the production PostgreSQL 17 environment has not been exercised by these tests. Do not treat the candidate as already deployed.
