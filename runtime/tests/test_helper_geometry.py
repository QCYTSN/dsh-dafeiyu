"""Exercise the real Qt window when PySide6 is installed for Helper builds."""

import os
import sys
import threading
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

try:
    from PySide6.QtCore import QRect, QTimer
    from PySide6.QtGui import QDesktopServices
    from PySide6.QtWidgets import QApplication
except ImportError:
    QApplication = None

from runtime.helper import EventRecorder, run_visual


@unittest.skipUnless(QApplication is not None, 'Qt integration runs with the Helper build dependencies')
class HelperGeometryTests(unittest.TestCase):
    def test_cards_alerts_and_drag_keep_the_rendered_and_saved_anchor_equal(self) -> None:
        original_exec = QApplication.exec
        finished = threading.Event()
        errors = []

        class WaitingInput:
            def __iter__(self):
                finished.wait(30)
                return iter(())

        def scripted_exec(app):
            window = next(w for w in app.topLevelWidgets() if hasattr(w, 'model'))

            def scenario():
                try:
                    window.micro_timer.stop()
                    window._screen_geometry_at = lambda x, y: QRect(0, 0, 1920, 1040)

                    def message(kind, **fields):
                        window.apply_message({'protocolVersion': 1, 'kind': kind, 'timestamp': 0, **fields})

                    def assert_anchor(expected):
                        self.assertEqual((window.pet_x, window.pet_y), expected)
                        x, y, _, _ = window._pet_rect()
                        self.assertEqual((window.x() + x, window.y() + y), expected)

                    message('config', soundEnabled=False, bubbleMode='hidden', scale=1.0, bubbleScale=1.0)
                    for expected in ((200, 30), (1508, 696)):
                        window._move_to_pet(*expected)
                        for mode in ('always', 'custom', 'hidden'):
                            message('config', bubbleMode=mode)
                            message('balance', summary='余额测试')
                            message('tasks', tasks=[{'state': 'WORKING'}] * 3)
                            assert_anchor(expected)
                            message('pulse', state='SUCCESS', ttlMs=2200, resumeState='IDLE')
                            window._begin_drag()
                            window._move_to_pet(*expected)
                            message('tasks', tasks=[])
                            message('balance', summary='')
                            window._finish_drag()
                            for _ in range(10):
                                window._tick()
                            assert_anchor(expected)
                        window.grab()  # Painting must use the same rectangle as hit testing.
                    with patch.object(QDesktopServices, 'openUrl', return_value=False), patch('sys.stderr'):
                        window._open_client()
                    self.assertEqual(window.overlay_message, '无法打开 DSH')
                    window._move_to_pet(500, 500)
                    message('config', bubbleMode='always')
                    message('pulse', state='SUCCESS', ttlMs=2200, resumeState='IDLE')
                    message('config', bubbleMode='hidden')

                    def after_notification():
                        try:
                            assert_anchor((500, 500))
                        except BaseException as error:
                            errors.append(error)
                        finally:
                            finished.set()
                            app.quit()

                    # Wait beyond the old shake duration to catch stale-origin
                    # restoration after a card resize, rather than just its first tick.
                    QTimer.singleShot(350, after_notification)
                except BaseException as error:
                    errors.append(error)
                    finished.set()
                    app.quit()

            QTimer.singleShot(0, scenario)
            return original_exec()

        with TemporaryDirectory() as directory, patch.dict(os.environ, {
            'QT_QPA_PLATFORM': 'offscreen', 'DSH_DAFEIYU_LAYOUT_PATH': str(Path(directory) / 'layout.json'),
        }), patch.object(QApplication, 'exec', scripted_exec), patch.object(sys, 'stdin', WaitingInput()):
            self.assertEqual(run_visual(EventRecorder(None)), 0)
        if errors:
            raise errors[0]


if __name__ == '__main__':
    unittest.main()
