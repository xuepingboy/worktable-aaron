#!/usr/bin/env python3
"""
工作计划管理工作台 - 图标归一化脚本
源 PNG 已是干净的圆角方块（RGBA，背景透明），
本脚本把任意尺寸缩放到 1024×1024，并生成多尺寸 ICO。

用法：python tools/process-icon.py
"""
from PIL import Image

ICON_DIR = r"F:\工作计划管理工作台\工作计划管理工作台\assets\icons"
SRC_PNG = f"{ICON_DIR}/工作计划管理工作台.png"      # 干净源（RGBA 透明）
ICO_PATH = f"{ICON_DIR}/工作计划管理工作台.ico"
PUBLIC_FAVICON = r"F:\工作计划管理工作台\工作计划管理工作台\public\favicon.ico"
DESKTOP_ICO = r"C:\Users\admin\Desktop\工作计划管理工作台.ico"  # 桌面副本：单独确认后更新

TARGET = 1024
ICO_SIZES = [16, 32, 48, 64, 128, 256]


def main():
    src = Image.open(SRC_PNG).convert("RGBA")
    print(f"源: {src.size} {src.mode}")

    # 缩放到 1024×1024
    result = src.resize((TARGET, TARGET), Image.LANCZOS)

    # 保存主源
    result.save(SRC_PNG, format="PNG")
    print(f"✓ 已覆盖: {SRC_PNG}")

    # 生成多尺寸 ICO
    result.save(ICO_PATH, format="ICO", sizes=[(s, s) for s in ICO_SIZES])
    print(f"✓ 已生成 ICO: {ICO_PATH}")

    # 同步 favicon
    result.save(PUBLIC_FAVICON, format="ICO", sizes=[(s, s) for s in ICO_SIZES])
    print(f"✓ 已同步: {PUBLIC_FAVICON}")

    print("⏸ 桌面副本未更新（需用户确认）")


def update_desktop_copy():
    """单独调用：把最新的图标写入桌面副本（需用户已确认）。"""
    src = Image.open(SRC_PNG).convert("RGBA")
    src.save(DESKTOP_ICO, format="ICO", sizes=[(s, s) for s in ICO_SIZES])
    print(f"✓ 桌面副本已更新: {DESKTOP_ICO}")


if __name__ == "__main__":
    main()