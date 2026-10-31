"""
中文试卷切题数据集 -> YOLO 目录结构

数据源: https://huggingface.co/datasets/ccace/chinese-exam-question-regions
输出:   <OUT_ROOT>/{images,labels}/{train,val,test} + dataset.yaml

用法:
    python prepare_dataset.py
    MAX_PAGES=120 python prepare_dataset.py      # 小样本先跑通流程
    OUT_ROOT=/kaggle/working/exam_yolo python prepare_dataset.py

Kaggle 上默认写到 /kaggle/temp（无输出配额限制），权重再单独放 /kaggle/working。
"""

import io
import os
import re
from pathlib import Path

from datasets import load_dataset
from PIL import Image
from tqdm.auto import tqdm

DATASET = os.environ.get("DATASET", "ccace/chinese-exam-question-regions")
ROOT = Path(os.environ.get("OUT_ROOT", "/kaggle/temp/exam_yolo"))
MAX_PAGES = int(os.environ.get("MAX_PAGES", "0"))  # 0 = 全量
JPEG_QUALITY = int(os.environ.get("JPEG_QUALITY", "95"))

# (输出目录名, HF split 名)
SPLITS = [("train", "train"), ("val", "validation"), ("test", "test")]


def safe_id(raw: str, used: set) -> str:
    """page_id 作为文件名，去掉可能破坏路径的字符并保证唯一"""
    name = re.sub(r"[^0-9A-Za-z_.-]", "_", str(raw)).strip("._") or "page"
    if name in used:
        name = f"{name}_{len(used)}"
    used.add(name)
    return name


def to_pil(value):
    """兼容 datasets 不同版本对 Image feature 的返回形态"""
    if isinstance(value, Image.Image):
        return value
    if isinstance(value, dict):
        if value.get("bytes") is not None:
            return Image.open(io.BytesIO(value["bytes"]))
        if value.get("path"):
            return Image.open(value["path"])
    raise TypeError(f"无法识别的 image 字段类型: {type(value)}")


def build_labels(row) -> list:
    """优先使用官方 yolo_labels；缺失时由像素框现算归一化坐标"""
    text = row.get("yolo_labels") or ""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if lines:
        return lines

    w = float(row["width"])
    h = float(row["height"])
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
            f"0 {(x1 + bw / 2) / w:.6f} {(y1 + bh / 2) / h:.6f} "
            f"{bw / w:.6f} {bh / h:.6f}"
        )
    return out


def convert(split_name: str, hf_split: str) -> tuple:
    ds = load_dataset(DATASET, split=hf_split)
    if MAX_PAGES > 0:
        ds = ds.select(range(min(MAX_PAGES, len(ds))))

    img_dir = ROOT / "images" / split_name
    lbl_dir = ROOT / "labels" / split_name
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)

    used = set()
    pages = 0
    boxes = 0
    empty = 0
    by_subject = {}

    for row in tqdm(ds, desc=f"{split_name:<5}", unit="page"):
        page_id = safe_id(row["page_id"], used)

        image = to_pil(row["image"]).convert("RGB")
        image.save(img_dir / f"{page_id}.jpg", quality=JPEG_QUALITY, optimize=True)

        lines = build_labels(row)
        (lbl_dir / f"{page_id}.txt").write_text(
            "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8"
        )

        pages += 1
        boxes += len(lines)
        if not lines:
            empty += 1
        subject = row.get("subject") or "未知"
        by_subject[subject] = by_subject.get(subject, 0) + 1

    print(f"  {split_name}: {pages} 页 / {boxes} 框 / {empty} 页无框")
    print("  科目分布:", dict(sorted(by_subject.items(), key=lambda kv: -kv[1])))
    return pages, boxes


def main() -> None:
    print(f"数据集 : {DATASET}")
    print(f"输出到 : {ROOT}")
    print(f"页数上限: {MAX_PAGES or '全量'}\n")

    total_pages = 0
    total_boxes = 0
    for split_name, hf_split in SPLITS:
        pages, boxes = convert(split_name, hf_split)
        total_pages += pages
        total_boxes += boxes

    yaml_path = ROOT / "dataset.yaml"
    yaml_path.write_text(
        "\n".join(
            [
                f"path: {ROOT.resolve().as_posix()}",
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

    print(f"\n合计 {total_pages} 页 / {total_boxes} 框")
    print(f"训练配置: {yaml_path}")
    print("\n--- dataset.yaml ---")
    print(yaml_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
