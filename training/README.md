# 中文试卷切题模型训练（Kaggle）

用 `ccace/chinese-exam-question-regions` 微调 YOLO26，得到单类 `question` 检测权重，
导出 ONNX 后供前端 `ImageCropper` 自动建议选框。

数据集：2360 页 / 12431 框 / 9 科目 / 单类 / CC BY 4.0（标注部分）

## 文件

| 文件 | 用途 |
|---|---|
| `run_all.py` | **一键全流程**（数据 → 训练 → 导出），单 cell 直接跑 |
| `prepare_dataset.py` | 只做数据转换，调试用 |
| `train.py` | 只做训练，调试用 |
| `export_onnx.py` | 只做导出，调试用 |

日常用 `run_all.py` 就够了，后三个是拆开的版本，需要单独调某一阶段时用。

---

## 一、Kaggle 环境设置

新建 Notebook 后在右侧 **Session options** 里设置：

| 项目 | 值 | 说明 |
|---|---|---|
| Accelerator | `GPU T4 x2` | P100 也可以，T4 更稳 |
| Internet | `On` | **必须开**，要下 HuggingFace 数据集 |
| Persistence | `Files only` | 可选 |

数据集是公开的，不需要配置 Secrets。

---

## 二、执行：一个 cell 跑完

新建一个 cell，把 `run_all.py` 全文粘进去，直接运行。就这样。

如果你更习惯保留脚本文件，也可以：

```python
%%writefile /kaggle/working/run_all.py
# ← 粘贴 run_all.py 全文
```

```python
!python /kaggle/working/run_all.py
```

### 时间预算（T4，yolo26n）

| 阶段 | 全量 | 冒烟（QUICK=True） |
|---|---|---|
| 准备数据 | 15~25 min | 2~3 min |
| 训练 | 1~1.5 h | 8~10 min |
| 导出 | 2 min | 2 min |

总时长 2 小时内，远低于 Kaggle 12 小时会话限制。

### 一定要先冒烟

脚本顶部有开关：

```python
QUICK = False   # 第一次先改成 True
```

`QUICK = True` 会切到 120 页 + 10 epoch，约 10 分钟跑通全链路。
确认能出 mAP、能导出 ONNX、预览图框位正常，再改回 `False` 全量训练。

### 断点续跑

三个阶段都会留标记，重复运行会自动跳过已完成的：

- 数据：`/kaggle/temp/exam_yolo/.prepared.json`（配置变了自动失效重跑）
- 训练：`runs/<name>/weights/best.pt` 存在即跳过
- 导出：同名 `.onnx` 存在即跳过

Kaggle 会话断了重连，重新运行同一个 cell 即可，不会从头再来。
需要强制重跑就把 `FORCE_PREPARE` / `FORCE_TRAIN` 改 `True`。

---

## 三、配置

全在 `run_all.py` 顶部配置区，改常量即可：

| 变量 | 默认 | 说明 |
|---|---|---|
| `QUICK` | `False` | 冒烟模式开关 |
| `BASE_MODEL` | `yolo26n.pt` | 换 `yolo26s.pt` 精度略升、体积 20MB、慢 2~3 倍 |
| `EPOCHS` | `100` | 数据集小，80~120 够 |
| `IMGSZ` | `1280` | **不要降**，640 下试卷小字会糊 |
| `BATCH` | `8` | T4 16G 上 n 可 8~16，OOM 降 4 |
| `DATA_ROOT` | `/kaggle/temp/exam_yolo` | 图片 2.5GB，放 temp 不占 20GB 输出配额 |
| `FORCE_PREPARE` / `FORCE_TRAIN` | `False` | 强制重跑对应阶段 |

---

## 四、预期指标

标注是 AI 逐页标注 + 交叉复核，`human_verified = false`，存在一定噪声。
合理预期区间：

| 指标 | 预期 |
|---|---|
| mAP50 | 0.82 ~ 0.90 |
| mAP50-95 | 0.55 ~ 0.70 |
| 单页推理（CPU, 1280） | 0.3 ~ 0.5 s |

低于 mAP50 0.75 时优先查：空标签页是否过多、`IMGSZ` 是否被改小、
是否误开了 `mosaic`（默认已关）。

---

## 五、数据增强为什么这么设

试卷是结构化文档，通用检测的默认增强会直接破坏任务前提：

| 增强 | 值 | 原因 |
|---|---|---|
| `mosaic` | 0.0 | 四图拼接会制造不存在的版面关系 |
| `mixup` | 0.0 | 同上，且文字叠影 |
| `fliplr` / `flipud` | 0.0 | 翻转后文字镜像，模型学到错误特征 |
| `copy_paste` | 0.0 | 检测任务下需 masks，且会造成重复题号 |
| `degrees` | 2.0 | 只保留极轻微旋转，对应手机拍摄歪斜 |
| `perspective` | 0.0005 | 模拟拍摄透视畸变 |
| `scale` | 0.3 | 允许一定缩放，对应拍摄距离差异 |

后续要提真实拍摄场景的鲁棒性，正确做法是**补拍数据**，
而不是把 `degrees` / `perspective` 调大。

---

## 六、排错

| 现象 | 处理 |
|---|---|
| `CUDA out of memory` | `BATCH = 4`，或 `IMGSZ = 1024`（会掉点） |
| 下数据集卡住 | 重跑，HF 支持断点续传 |
| `yolo26n.pt` 找不到 | 脚本会自动升级 ultralytics；仍失败就手动 `!pip install -U ultralytics` 后重启内核 |
| `/kaggle/working` 超 20GB | `cache=False`，或把 `PROJECT` 指到 `/kaggle/temp/runs` |
| ONNX 输出 `[1,5,8400]` | 正常，YOLO26 导出不含 NMS，前端需自行解码 + NMS |
| 预览图框全偏 | letterbox 的 `left/top` 未减掉，或 BGR/RGB 搞反 |
| 导出报 `onnxslim` 缺失 | 脚本会自动装；失败就 `!pip install onnx onnxslim` |

---

## 七、训练完之后

1. 从 Kaggle 输出下载 `/kaggle/working/best.onnx`（脚本已复制到根目录方便下载）；
2. 放到前端 `public/models/exam-question.onnx`；
3. 前端用 onnxruntime-web 加载，预处理/后处理照搬 `run_all.py` 里
   `letterbox` / `to_tensor` / `decode` / `nms` 四段逻辑；
4. 模型输出接进 `ImageCropper`，作为「建议框」预填，用户仍可手动拖动。

`public/models/` 目前不存在，需要新建。ONNX 是二进制大文件，
建议走 Git LFS，或在 `.gitignore` 里排除后由 CI 单独拉取。
