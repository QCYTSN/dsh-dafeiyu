"""Qt-free asset path resolution for the packaged helper.

The npm package ships the assets once; the Windows/WSL local cache copies the
directory next to the cached executable (see cacheWslBundledHelper in
src/helper-process.js). A frozen helper therefore resolves assets from its own
neighbourhood first, and only falls back to a PyInstaller _MEIPASS embed for
older self-contained builds still in a cache directory.
"""

from __future__ import annotations

import sys
from pathlib import Path


def bundle_root() -> Path:
    """Locate packaged assets for source runs, cached copies, and legacy embeds."""
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root is not None:
        exe_dir = Path(sys.executable).resolve().parent
        sibling = exe_dir / "assets"
        if sibling.is_dir():
            return exe_dir
        packaged = exe_dir.parent.parent.parent
        if (packaged / "assets" / "pet-manifest.json").is_file():
            return packaged
        return Path(frozen_root)
    return Path(__file__).resolve().parent.parent
