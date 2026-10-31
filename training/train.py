"""
训练 YOLO26 中文试卷切题模型（单类 question 检测）

前置: 先跑 prepare_dataset.py 生成 dataset.yaml

用法:
    python train.py
    BASE=yolo26s.pt NAME=exam_yolo26s_1280 python train.py
    EPOCHS=10 BATCH=4 python train.py            # 冒烟测试

关于增强: 试卷是结构化文档，mosaic / mixup / 翻转 会破坏版面与文字方向，
在文档检测任务上通常有害，这里全部关闭，只保留轻微几何与色彩扰动。
"""

import os

from ultralytics import YOLO

DATA = os.environ.get("DATA", "/kaggle/temp/exam_yolo/dataset.yaml")
BASE = os.environ.get("BASE", "yolo26n.pt")  # yolo26n.pt / yolo26s.pt
NAME = os.environ.get("NAME", "exam_yolo26n_1280")
PROJECT = os.environ.get("PROJECT", "/kaggle/working/runs")
EPOCHS = int(os.environ.get("EPOCHS", "100"))
IMGSZ = int(os.environ.get("IMGSZ", "1280"))
BATCH = int(os.environ.get("BATCH", "8"))  # T4 16G 上 n 可到 8~16，OOM 就降到 4
WORKERS = int(os.environ.get("WORKERS", "4"))
DEVICE = os.environ.get("DEVICE", "0")


def main() -> None:
    model = YOLO(BASE)

    model.train(
        data=DATA,
        epochs=EPOCHS,
        imgsz=IMGSZ,
        batch=BATCH,
        device=DEVICE,
        workers=WORKERS,
        project=PROJECT,
        name=NAME,
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
        verbose=True,
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

    metrics = model.val(data=DATA, imgsz=IMGSZ, batch=BATCH, device=DEVICE)
    print("\n--- 验证集指标 ---")
    print(f"mAP50    : {metrics.box.map50:.4f}")
    print(f"mAP50-95 : {metrics.box.map:.4f}")
    print(f"precision: {metrics.box.mp:.4f}")
    print(f"recall   : {metrics.box.mr:.4f}")
    print(f"\n最佳权重: {PROJECT}/{NAME}/weights/best.pt")


if __name__ == "__main__":
    main()
