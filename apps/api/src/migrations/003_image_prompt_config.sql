-- 家庭关卡配图提示词。无行时 API 返回内置默认，不在这里播种。
CREATE TABLE IF NOT EXISTS image_prompt_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  safety_prefix TEXT NOT NULL,
  scene_template TEXT NOT NULL,
  item_template TEXT NOT NULL,
  distractor_template TEXT NOT NULL,
  negative_prompt TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
