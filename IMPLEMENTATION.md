# 找文件动作流接入说明

将 `assets/pet/file_search/*.png` 复制到仓库的同名目录，并用本目录中的 `assets/pet-manifest.json` 覆盖仓库原文件。

`workingActivityMap.searching` 已改为 `file_search`。当 DSH 识别到搜索、查找、读取、打开等工具时，会按图片顺序播放 17 个动作；搜索结束后由现有状态事件切回思考、成功或错误状态。

本次动作帧由用户提供的参考图拆分为透明 PNG，尺寸限制保持为宽 238、高 260 以内。
