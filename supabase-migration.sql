-- ============================================================
-- tab-home — Supabase Migration
--
-- Run this in: Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================

-- ── 1. 创建表 ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme                 TEXT NOT NULL DEFAULT 'light',
  lang                  TEXT NOT NULL DEFAULT 'en',
  background_image_url  TEXT NOT NULL DEFAULT '',
  background_brightness INTEGER NOT NULL DEFAULT 72,
  background_blur       INTEGER NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_links (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  x_url         TEXT NOT NULL DEFAULT '',
  instagram_url TEXT NOT NULL DEFAULT '',
  github_url    TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.favorites (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  slot            INTEGER NOT NULL DEFAULT 0,
  custom_logo_url TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_url ON public.favorites(user_id, url);

CREATE TABLE IF NOT EXISTS public.workspace_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  tabs        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_user_id ON public.workspace_snapshots(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_snapshots_user_snapshot_id ON public.workspace_snapshots(user_id, snapshot_id);

-- ── 2. 启用 RLS ────────────────────────────────────────────────

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_snapshots ENABLE ROW LEVEL SECURITY;

-- ── 3. RLS 策略 — 用户只能读写自己的数据 ────────────────────────

DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings"
  ON public.user_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own social links" ON public.social_links;
CREATE POLICY "Users manage own social links"
  ON public.social_links
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own favorites" ON public.favorites;
CREATE POLICY "Users manage own favorites"
  ON public.favorites
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own workspace snapshots" ON public.workspace_snapshots;
CREATE POLICY "Users manage own workspace snapshots"
  ON public.workspace_snapshots
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 4. 关闭邮箱确认（可选 — 允许注册后直接登录） ─────────────────

-- 如果在 Supabase Dashboard → Authentication → Settings 中已经关了，
-- 下面这行可以跳过。否则取消注释执行：
-- UPDATE auth.config SET email_confirm_required = false;
