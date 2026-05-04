# Supabase Sync Workflow

## Goal

Use Supabase to support:

- multi-user accounts
- cloud sync across devices
- background image storage
- future sharing / template features

The extension remains local-first:

- `chrome.storage.local` stays the immediate UI cache
- Supabase becomes the cloud source of truth after login

## Recommended rollout

### Phase 1: Foundation

1. Create a Supabase project.
2. Create tables for:
   - `profiles`
   - `user_settings`
   - `favorites`
   - `social_links`
3. Create a public Storage bucket for background images, or a private bucket if signed URLs are preferred.
4. Add RLS so every user can only access their own records.
5. Add extension-side config inputs:
   - Supabase project URL
   - Supabase anon key

### Phase 2: Authentication

1. Add sign-in / sign-out UI in the extension.
2. Use `chrome.identity.launchWebAuthFlow` for OAuth or magic-link completion.
3. Store the session locally.
4. Show sync state in settings:
   - local only
   - configured
   - signed in
   - sync error

### Phase 3: Initial sync

1. On sign-in, fetch cloud data.
2. Compare local cache with cloud records.
3. Run first-time merge rules:
   - if cloud is empty, upload local
   - if both exist, prefer latest `updated_at`
   - background image is handled separately from settings JSON

### Phase 4: Ongoing sync

1. Keep writing user actions to `chrome.storage.local` first.
2. Debounce cloud writes.
3. Sync these datasets:
   - favorites
   - theme / language / background settings
   - social links
4. Track `updated_at` on every entity.

### Phase 5: Sharing

Later you can add:

1. public profile / public config snapshots
2. import from another user's shared template
3. copy someone's layout into your own account

## Extension-side storage model

Keep these keys in `chrome.storage.local`:

- `favorites`
- `backgroundSettings`
- `socialLinks`
- `theme`
- `lang`
- `syncSettings`
- `syncSession`

Suggested `syncSettings` shape:

```json
{
  "provider": "supabase",
  "projectUrl": "",
  "anonKey": "",
  "enabled": false,
  "lastSyncAt": null,
  "lastSyncError": ""
}
```

## Merge strategy for v1

Use simple rules first:

- local writes update local cache immediately
- background upload writes to Storage first, then stores returned file path in `user_settings`
- cloud conflict strategy:
  - latest `updated_at` wins

This is enough for a strong first version.

## Notes

- Do not put large background image data into Supabase rows.
- Store background binaries in Storage and only keep URLs / paths in tables.
- Do not rely on `chrome.storage.sync` for real multi-user sync; keep it local-only or skip it.
