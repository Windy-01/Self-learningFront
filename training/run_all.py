"""
中文试卷切题模型 · 一键训练（Kaggle 单 cell 版）

把本文件全部内容粘进一个 Kaggle cell 直接运行即可，
或 %%writefile /kaggle/working/run_all.py 后 !python /kaggle/working/run_all.py

流程：准备数据 -> 训练 YOLO26 -> 导出 ONNX
每阶段完成会写标记，重复运行自动跳过已完成阶段（改配置会自动失效重跑）。

Kaggle 前提：Session options 里 Internet = On，Accelerator = GPU T4 x2
"""

import io
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

# ============================ 配置区 ============================
# 冒烟测试：120 页 + 10 epoch，约 10 分钟跑通全链路。
# 第一次务必先设 True 跑一遍，确认无误再改回 False 全量训练。
QUICK = False

DATASET = "ccace/chinese-exam-question-regions"
BASE_MODEL = "yolo26n.pt"  # yolo26n.pt（5.3MB，推荐）/ yolo26s.pt（20MB，略高精度）
EPOCHS = 100
IMGSZ = 1280  # 不要降低，640 下试卷小字会糊
BATCH = 8  # T4 16G：n 可 8~16，OOM 改成 4
WORKERS = 4

DATA_ROOT = Path("/kaggle/temp/exam_yolo")  # 图片 2.5GB，放 temp 不占 20GB 输出配额
PROJECT = Path("/kaggle/working/runs")
JPEG_QUALITY = 95

FORCE_PREPARE = False  # True 强制重新转换数据集
FORCE_TRAIN = False  # True 忽略已有 best.pt 重新训练

if QUICK:
    MAX_PAGES = 120
    EPOCHS = 10
    BATCH = min(BATCH, 4)
    RUN_NAME = "exam_quick"
else:
    MAX_PAGES = 0
    RUN_NAME = f"{Path(BASE_MODEL).stem}_{IMGSZ}"

SPLITS = [("train", "train"), ("val", "validation"), ("test", "test")]
# ================================================================


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def ensure_deps() -> None:
    """Kaggle 镜像的 ultralytics 可能不支持 yolo26，版本不够就升级

    这里只读包元数据、不 import 模块，否则升级后 sys.modules 里仍是旧版本。
    """
    import importlib
    from importlib.metadata import PackageNotFoundError, version

    try:
        cur = version("ultralytics")
    except PackageNotFoundError:
        cur = None

    if cur:
        parts = [int(x) for x in re.findall(r"\d+", cur)[:3]]
        while len(parts) < 3:
            parts.append(0)
        if tuple(parts) >= (8, 3, 0):
            log(f"ultralytics {cur} 已就绪")
            return
        log(f"ultralytics {cur} 过旧，升级中")
    else:
        log("未安装 ultralytics，安装中")

    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "-U", "ultralytics"],
        check=True,
    )
    importlib.invalidate_caches()
    log("依赖安装完成")


# ------------------------------ 阶段 1 ------------------------------
def safe_id(raw: str, used: set) -> str:
    name = re.sub(r"[^0-9A-Za-z_.-]", "_", str(raw)).strip("._") or "page"
    if name in used:
        name = f"{name}_{len(used)}"
    used.add(name)
    return name


def to_pil(value):
    from PIL import Image

    if isinstance(value, Image.Image):
        return value
    if isinstance(value, dict):
        if value.get("bytes") is not None:
            return Image.open(io.BytesIO(value["bytes"]))
        if value.get("path"):
            return Image.open(value["path"])
    raise TypeError(f"无法识别的 image 字段类型: {type(value)}")


def build_labels(row) -> list:
    """优先用官方 yolo_labels，缺失时由像素框换算"""
    text = row.get("yolo_labels") or ""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if lines:
        return lines

    w, h = float(row["width"]), float(row["height"])
    if w <= 0 or h <= 0:
        return []

    out = []
    for box in row.get("bboxes") or []:
        if len(box) < 4:
            continue
        x1, y1, x2, y2 = (float(v) for v in box[:4])
        x1, x2 = sorted((min(max(x1, 0.0), w), min(max(x2, 0.0), w)))
        y1, y2 = sorted((min(max(y1, 0.0), h), min(max(y2, 0.0), h)))
        bw, bh = x2 - x1, y2 - y1
        if bw <= 1.0 or bh <= 1.0:
            continue
        out.append(
            f"0 {(x1 + bw / 2) / w:.6f} {(y1 + bh / 2) / h:.6f} {bw / w:.6f} {bh / h:.6f}"
        )
    return out


def stage_prepare() -> Path:
    marker = DATA_ROOT / ".prepared.json"
    if not FORCE_PREPARE and marker.exists():
        info = json.loads(marker.read_text(encoding="utf-8"))
        if info.get("dataset") == DATASET and info.get("max_pages") == MAX_PAGES:
            log(f"数据已就绪（{info['pages']} 页 / {info['boxes']} 框），跳过转换")
            return DATA_ROOT / "dataset.yaml"

    os.environ.setdefault("HF_HOME", "/kaggle/temp/hf")

    from datasets import load_dataset
    from tqdm.auto import tqdm

    log(f"准备数据: {DATASET} -> {DATA_ROOT}")

    total_pages = 0
    total_boxes = 0
    for split_name, hf_split in SPLITS:
        ds = load_dataset(DATASET, split=hf_split)
        if MAX_PAGES > 0:
            ds = ds.select(range(min(MAX_PAGES, len(ds))))

        img_dir = DATA_ROOT / "images" / split_name
        lbl_dir = DATA_ROOT / "labels" / split_name
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)

        used: set = set()
        pages = boxes = empty = 0
        subjects: dict = {}

        for row in tqdm(ds, desc=f"  {split_name:<5}", unit="page"):
            page_id = safe_id(row["page_id"], used)
            to_pil(row["image"]).convert("RGB").save(
                img_dir / f"{page_id}.jpg", quality=JPEG_QUALITY, optimize=True
            )
            lines = build_labels(row)
            (lbl_dir / f"{page_id}.txt").write_text(
                "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8"
            )
            pages += 1
            boxes += len(lines)
            empty += not lines
            sub = row.get("subject") or "未知"
            subjects[sub] = subjects.get(sub, 0) + 1

        total_pages += pages
        total_boxes += boxes
        top = dict(sorted(subjects.items(), key=lambda kv: -kv[1])[:4])
        log(f"  {split_name}: {pages} 页 / {boxes} 框 / {empty} 页无框 | {top}")

    yaml_path = DATA_ROOT / "dataset.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                f"path: {DATA_ROOT.resolve().as_posix()}",
                "train: images/train",
                "val: images/val",
                "test: images/test",
                "names:",
                "  0: question",
                "",
            ]
        ),
        encoding="utf-8",
    )
    marker.write_text(
        json.dumps(
            {"dataset": DATASET, "max_pages": MAX_PAGES, "pages": total_pages, "boxes": total_boxes}
        ),
        encoding="utf-8",
    )
    log(f"数据完成: {total_pages} 页 / {total_boxes} 框")
    return yaml_path


# ------------------------------ 阶段 2 ------------------------------
def stage_train(data_yaml: Path) -> Path:
    from ultralytics import YOLO

    best = PROJECT / RUN_NAME / "weights" / "best.pt"
    if not FORCE_TRAIN and best.exists():
        log(f"已有权重，跳过训练: {best}")
        return best

    log(f"开始训练 {BASE_MODEL} | epochs={EPOCHS} imgsz={IMGSZ} batch={BATCH}")
    model = YOLO(BASE_MODEL)
    model.train(
        data=str(data_yaml),
        epochs=EPOCHS,
        imgsz=IMGSZ,
        batch=BATCH,
        device=0,
        workers=WORKERS,
        project=str(PROJECT),
        name=RUN_NAME,
        exist_ok=True,
        seed=0,
        pretrained=True,
        optimizer="auto",
        lr0=0.01,
        lrf=0.01,
        warmup_epochs=3.0,
        cos_lr=True,
        patience=30,
        cache="disk",
        amp=True,
        plots=True,
        val=True,
        save=True,
        save_period=10,
        # ---- 文档检测关键：关掉破坏版面的增强 ----
        mosaic=0.0,
        mixup=0.0,
        copy_paste=0.0,
        fliplr=0.0,
        flipud=0.0,
        degrees=2.0,
        translate=0.05,
        scale=0.3,
        shear=0.0,
        perspective=0.0005,
        hsv_h=0.015,
        hsv_s=0.30,
        hsv_v=0.30,
    )

    metrics = model.val(data=str(data_yaml), imgsz=IMGSZ, batch=BATCH, device=0)
    log("验证集指标:")
    log(f"  mAP50    = {metrics.box.map50:.4f}")
    log(f"  mAP50-95 = {metrics.box.map:.4f}")
    log(f"  precision= {metrics.box.mp:.4f}  recall= {metrics.box.mr:.4f}")
    return best


# ------------------------------ 阶段 3 ------------------------------
def letterbox(image, size: int, pad: int = 114):
    """等比缩放 + 灰边填充，前端需保持同样逻辑"""
    from PIL import Image

    w, h = image.size
    scale = min(size / w, size / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    canvas = Image.new("RGB", (size, size), (pad, pad, pad))
    left, top = (size - nw) // 2, (size - nh) // 2
    canvas.paste(image.resize((nw, nh), Image.BILINEAR), (left, top))
    return canvas, scale, left, top


def to_tensor(image):
    import numpy as np

    arr = np.asarray(image, dtype=np.float32) / 255.0
    return np.ascontiguousarray(arr.transpose(2, 0, 1)[None, ...])


def nms(boxes, scores, iou_thr: float = 0.5):
    import numpy as np

    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        if order.size == 1:
            break
        rest = order[1:]
        xx1 = np.maximum(boxes[i, 0], boxes[rest, 0])
        yy1 = np.maximum(boxes[i, 1], boxes[rest, 1])
        xx2 = np.minimum(boxes[i, 2], boxes[rest, 2])
        yy2 = np.minimum(boxes[i, 3], boxes[rest, 3])
        inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
        area_i = (boxes[i, 2] - boxes[i, 0]) * (boxes[i, 3] - boxes[i, 1])
        area_r = (boxes[rest, 2] - boxes[rest, 0]) * (boxes[rest, 3] - boxes[rest, 1])
        iou = inter / np.maximum(area_i + area_r - inter, 1e-9)
        order = rest[iou <= iou_thr]
    return np.array(keep, dtype=np.int64)


def decode(output, scale: float, left: int, top: int, conf_thr: float = 0.25):
    """网络输出 -> 原图坐标 xyxy + score

    YOLO26 导出的 ONNX 输出为 [1, 4+nc, N]（无 objectness、无 NMS），
    N 远大于通道数，据此判断是否需要转置。
    """
    import numpy as np

    pred = output[0] if output.ndim == 3 else output
    if pred.shape[0] < pred.shape[1]:
        pred = pred.T  # (C, N) -> (N, C)

    if pred.shape[1] == 6:  # end2end：已是 xyxy + score + cls
        boxes, scores = pred[:, :4], pred[:, 4]
        mask = scores >= conf_thr
        boxes, scores = boxes[mask], scores[mask]
    else:  # 标准 anchor：cx cy w h + 各类分数
        scores = pred[:, 4:].max(axis=1)
        mask = scores >= conf_thr
        if not mask.any():
            return np.zeros((0, 4), np.float32), np.zeros((0,), np.float32)
        cx, cy, w, h = pred[mask, :4].T
        boxes = np.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], axis=1)
        scores = scores[mask]

    if boxes.size == 0:
        return np.zeros((0, 4), np.float32), np.zeros((0,), np.float32)

    keep = nms(boxes, scores)
    boxes, scores = boxes[keep], scores[keep]
    boxes[:, [0, 2]] = (boxes[:, [0, 2]] - left) / scale
    boxes[:, [1, 3]] = (boxes[:, [1, 3]] - top) / scale
    return boxes.astype(np.float32), scores.astype(np.float32)


def stage_export(best: Path) -> Path:
    import numpy as np
    from PIL import Image, ImageDraw
    from ultralytics import YOLO

    for pkg in ("onnx", "onnxslim", "onnxruntime"):
        try:
            __import__(pkg)
        except ImportError:
            log(f"安装导出依赖 {pkg}")
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", pkg], check=True)

    import onnxruntime as ort

    onnx_path = Path(best).with_suffix(".onnx")
    if not onnx_path.exists():
        log("导出 ONNX...")
        onnx_path = Path(
            YOLO(str(best)).export(
                format="onnx", imgsz=IMGSZ, opset=17, simplify=True, dynamic=False, half=False
            )
        )
    else:
        log(f"ONNX 已存在: {onnx_path}")

    log(f"ONNX {onnx_path.name} | {onnx_path.stat().st_size / 1024 / 1024:.2f} MB")

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    shape = sess.run(None, {inp.name: np.zeros((1, 3, IMGSZ, IMGSZ), np.float32)})[0].shape
    log(f"输入 {inp.name} {inp.shape} -> 输出 {shape}")
    if len(shape) == 3 and shape[1] < shape[2]:
        log(f"  标准 anchor 输出，{shape[1] - 4} 类，需外部 NMS（前端照搬 decode/nms）")
    elif len(shape) == 3 and shape[2] == 6:
        log("  end2end 输出，已含 NMS")

    sample_dir = DATA_ROOT / "images" / "test"
    if sample_dir.exists():
        preview_dir = Path("/kaggle/working/preview")
        preview_dir.mkdir(parents=True, exist_ok=True)
        for path in sorted(sample_dir.glob("*.jpg"))[:6]:
            image = Image.open(path).convert("RGB")
            canvas, scale, left, top = letterbox(image, IMGSZ)
            out = sess.run(None, {inp.name: to_tensor(canvas)})
            boxes, scores = decode(out, scale, left, top)
            draw = ImageDraw.Draw(image)
            for (x1, y1, x2, y2), s in zip(boxes, scores):
                draw.rectangle([x1, y1, x2, y2], outline=(230, 30, 30), width=4)
                draw.text((x1 + 6, max(0, y1 - 14)), f"{s:.2f}", fill=(230, 30, 30))
            image.save(preview_dir / path.name, quality=90)
            log(f"  预览 {path.name}: {len(boxes)} 框")
        log(f"预览图: {preview_dir}")

    handoff = Path("/kaggle/working/best.onnx")
    shutil.copy2(onnx_path, handoff)
    log(f"已复制到 {handoff}（方便下载）")
    return handoff


# ------------------------------ 主流程 ------------------------------
def main() -> None:
    log("=" * 56)
    log(f"模式: {'冒烟测试' if QUICK else '全量'} | {BASE_MODEL} | {IMGSZ}px | {EPOCHS} epoch")
    log("=" * 56)

    t0 = time.time()
    ensure_deps()
    data_yaml = stage_prepare()
    best = stage_train(data_yaml)
    onnx_path = stage_export(best)

    log("=" * 56)
    log(f"全部完成，耗时 {(time.time() - t0) / 60:.1f} 分钟")
    log(f"权重: {best}")
    log(f"ONNX: {onnx_path}")
    log("=" * 56)


if __name__ == "__main__":
    main()
