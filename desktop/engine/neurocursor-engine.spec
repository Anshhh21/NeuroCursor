# -*- mode: python ; coding: utf-8 -*-
import mediapipe
import os

# Locate the mediapipe package directory so we can bundle its data files
# (the .task model files, TFLite models, etc. that live inside the package)
mediapipe_path = os.path.dirname(mediapipe.__file__)

a = Analysis(
    ['src/neurocursor/__main__.py'],
    pathex=['src'],
    binaries=[],
    datas=[
        # Bundle our hand landmarker model
        ('src/neurocursor/hand_landmarker.task', 'neurocursor'),
        # Bundle ALL of mediapipe's internal data files (models, metadata, etc.)
        (mediapipe_path, 'mediapipe'),
    ],
    hiddenimports=[
        # Our own package
        'neurocursor',
        'neurocursor.app',
        # MediaPipe core and tasks — PyInstaller misses these C extensions
        'mediapipe',
        'mediapipe.tasks',
        'mediapipe.tasks.python',
        'mediapipe.tasks.python.vision',
        'mediapipe.tasks.python.core',
        'mediapipe.tasks.python.components',
        'mediapipe.tasks.python.components.containers',
        'mediapipe.tasks.core',
        'mediapipe.tasks.c',
        'mediapipe.tasks.c.vision',
        'mediapipe.tasks.c.vision.hand_landmarker',
        'mediapipe.python',
        'mediapipe.python._framework_bindings',
        # OpenCV
        'cv2',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='neurocursor-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)