<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Commit as the repo owner

Cloud sessions start with a global git identity of `Claude
<noreply@anthropic.com>`. GitHub and Vercel pick the avatar on a commit from
the author's email, so commits made with that default show an Anthropic icon
instead of the owner's.

Before your first commit, set the identity on this clone:

```
git config user.name  "GeminiSupa"
git config user.email "pgemini6780@gmail.com"
```

Keep adding the `Co-Authored-By: Claude ...` trailer. Authorship is the owner's;
the trailer is what records that the work was AI-assisted.
