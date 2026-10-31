"""
导出 ONNX 并校验，同时生成纯 numpy 的预处理/后处理参考实现

用法:
    python export_onnx.py
    WEIGHTS=/kaggle/working/runs/xxx/weights/best.pt python export_onnx.py

输出的 letterbox / NMS 逻辑与前端 TypeScript 版本保持一致，可直接对照移植。
"""

import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw
from ultralytics import YOLO

WEIGHTS = os.environ.get(
    "WEIGHTS", "/kaggle/working/runs/exam_yolo26n_1280/weights/best.pt"
)
IMGSZ = int(os.environ.get("IMGSZ", "1280"))
OP_SET = int(os.environ.get("OP_SET", "17"))
PREVIEW_DIR = Path(os.environ.get("PREVIEW_DIR", "/kaggle/working/preview"))
SAMPLE_DIR = Path(os.environ.get("SAMPLE_DIR", "/kaggle/temp/exam_yolo/images/test"))


# --------------------------------------------------------------------------
# 预处理 / 后处理参考实现（前端需保持一致）
# --------------------------------------------------------------------------
def letterbox(image: Image.Image, size: int = 1280, pad: int = 114):
    """等比缩放到 size×size，空余部分用 114 灰填充，返回图与缩放参数"""
    w, h = image.size
    scale = min(size / w, size / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    resized = image.resize((nw, nh), Image.BILINEAR)

    canvas = Image.new("RGB", (size, size), (pad, pad, pad))
    left, top = (size - nw) // 2, (size - nh) // 2
    canvas.paste(resized, (left, top))
    return canvas, scale, left, top


def to_tensor(image: Image.Image) -> np.ndarray:
    """HWC uint8 RGB -> 1×3×H×W float32 0~1"""
    arr = np.asarray(image, dtype=np.float32) / 255.0
    return np.ascontiguousarray(arr.transpose(2, 0, 1)[None, ...])


def nms(boxes: np.ndarray, scores: np.ndarray, iou_thr: float = 0.5) -> np.ndarray:
    """boxes 为 xyxy 像素坐标，返回保留的下标"""
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


def decode(output: np.ndarray, scale: float, left: int, top: int, conf_thr: float = 0.25):
    """把网络输出还原成原图坐标的 xyxy + score

    YOLO26 导出的 ONNX 输出为 [1, 4+nc, N]（无 objectness、无 NMS），
    N 远大于通道数，据此判断是否需要转置。
    """
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

    # 去掉 letterbox 的灰边，映射回原图
    boxes[:, [0, 2]] = (boxes[:, [0, 2]] - left) / scale
    boxes[:, [1, 3]] = (boxes[:, [1, 3]] - top) / scale
    return boxes.astype(np.float32), scores.astype(np.float32)


# --------------------------------------------------------------------------
def main() -> None:
    model = YOLO(WEIGHTS)
    onnx_path = Path(
        model.export(
            format="onnx",
            imgsz=IMGSZ,
            opset=OP_SET,
            simplify=True,
            dynamic=False,
            half=False,
        )
    )

    size_mb = onnx_path.stat().st_size / 1024 / 1024
    print(f"\nONNX : {onnx_path}")
    print(f"体积 : {size_mb:.2f} MB")

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    outs = sess.get_outputs()
    print(f"输入 : {inp.name} {inp.shape} {inp.type}")
    for o in outs:
        print(f"输出 : {o.name} {o.shape}")

    dummy = np.zeros((1, 3, IMGSZ, IMGSZ), dtype=np.float32)
    result = sess.run(None, {inp.name: dummy})
    shape = result[0].shape
    print(f"\n实测输出形状: {shape}")
    if len(shape) == 3 and shape[1] < shape[2]:
        print(f"  -> 标准 anchor 输出，{shape[1] - 4} 个类别，需外部做 NMS")
    elif len(shape) == 3 and shape[2] == 6:
        print("  -> end2end 输出，已含 NMS，无需外部去重")
    else:
        print("  -> 形状未识别，请按实际结构调整后处理")

    # 拿测试集几张图跑一遍，确认框位置正常
    if SAMPLE_DIR.exists():
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        samples = sorted(SAMPLE_DIR.glob("*.jpg"))[:6]
        for path in samples:
            image = Image.open(path).convert("RGB")
            canvas, scale, left, top = letterbox(image, IMGSZ)
            out = sess.run(None, {inp.name: to_tensor(canvas)})
            boxes, scores = decode(out, scale, left, top)

            draw = ImageDraw.Draw(image)
            for (x1, y1, x2, y2), s in zip(boxes, scores):
                draw.rectangle([x1, y1, x2, y2], outline=(230, 30, 30), width=4)
                draw.text((x1 + 6, max(0, y1 - 14)), f"{s:.2f}", fill=(230, 30, 30))
            image.save(PREVIEW_DIR / path.name, quality=90)
            print(f"  预览 {path.name}: {len(boxes)} 个框")

        print(f"\n预览图已写入: {PREVIEW_DIR}")
    else:
        print(f"\n跳过预览：{SAMPLE_DIR} 不存在")

    print("\n下一步：下载 ONNX 放到前端 public/models/exam-question.onnx")


if __name__ == "__main__":
    main()
