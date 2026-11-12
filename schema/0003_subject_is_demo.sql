-- 0003（只增不改）：档案的演示/真实标记。
-- demo 播种写 1（不可删、不被覆盖）；用户在界面新建的档案写 0。
ALTER TABLE subject ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
