"""Application entry and loop helpers."""
import json
import sys
import time
import cv2
import mediapipe as mp
import os
import math
import base64
from neurocursor import __version__

# for pinch detection, we need to calculate the distance between the index finger tip and thumb tip
def get_distance(p1, p2):
    return math.hypot(p1.x - p2.x, p1.y - p2.y)

def run() -> int:
    status = {
        "engineStatus": "ready",
        "version": __version__,
        "message": f"NeuroCursor V{__version__} engine initialized."
    }
    print(json.dumps(status))
    sys.stdout.flush()

    # pytinstaller files does what THIS
    if getattr(sys, 'frozen', False):
        model_path = os.path.join(sys._MEIPASS, 'neurocursor', 'hand_landmarker.task')
    else:
        model_path = os.path.join(os.path.dirname(__file__), 'hand_landmarker.task')
    
    BaseOptions = mp.tasks.BaseOptions
    HandLandmarker = mp.tasks.vision.HandLandmarker
    HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    # ── Pause/Resume toggle state ─────────────────────────────────────────
    # Open palm once = pause.  Open palm again = resume.  No fist needed.
    cursor_paused = False  # Is the cursor currently frozen?
    prev_palm     = False  # Was the last frame an open palm? (rising-edge guard)

    def print_result(result, output_image, timestamp_ms: int):
        nonlocal cursor_paused, prev_palm
        
        # Convert MP Image to base64 JPEG
        try:
            frame_rgb = output_image.numpy_view()
            frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
            frame_resized = cv2.resize(frame_bgr, (320, 240))
            _, buffer = cv2.imencode('.jpg', frame_resized, [cv2.IMWRITE_JPEG_QUALITY, 50])
            frame_b64 = base64.b64encode(buffer).decode('utf-8')
        except Exception:
            frame_b64 = ""

        telemetry = {
            "event": "tracking",
            "hand": "Unknown",
            "timestamp": timestamp_ms,
            "frame": frame_b64
        }

        if result.hand_landmarks:
            hand_landmarks = result.hand_landmarks[0]
            handedness = result.handedness[0]
            
            lm = hand_landmarks.landmark if hasattr(hand_landmarks, 'landmark') else hand_landmarks
            hd = handedness.classification if hasattr(handedness, 'classification') else handedness
            hand_name = getattr(hd[0], 'category_name', getattr(hd[0], 'label', "Unknown"))
            
            thumb_tip = lm[4]
            index_tip = lm[8]
            middle_tip = lm[12]
            ring_tip = lm[16]
            pinky_tip = lm[20]

            index_up = index_tip.y < lm[6].y
            middle_up = middle_tip.y < lm[10].y
            ring_up = ring_tip.y < lm[14].y
            pinky_up = pinky_tip.y < lm[18].y
            
            fingers_up_count = sum([index_up, middle_up, ring_up, pinky_up])
            pinch_dist = get_distance(index_tip, thumb_tip)
            is_pinching = pinch_dist < 0.05 

            current_event = "tracking"
            is_palm = (fingers_up_count == 4)

            if is_palm and not prev_palm:
                cursor_paused = not cursor_paused
            prev_palm = is_palm

            if cursor_paused:
                current_event = "pause"
            elif is_pinching:
                current_event = "left-click"
            elif index_up and middle_up and not ring_up and not pinky_up:
                current_event = "scroll"
            
            telemetry["event"] = current_event
            telemetry["hand"] = hand_name
            telemetry["x"] = index_tip.x
            telemetry["y"] = index_tip.y
        else:
            prev_palm = False

        try:
            print(json.dumps(telemetry))
            sys.stdout.flush()
        except (BrokenPipeError, IOError):
            os._exit(0)

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.LIVE_STREAM,
        result_callback=print_result,
        num_hands=1
    )

    cap = cv2.VideoCapture(0)
    
    try:
        with HandLandmarker.create_from_options(options) as landmarker:
            last_ts_ms = -1  # Tracks last timestamp — MediaPipe requires strictly increasing values
            while cap.isOpened():
                success, frame = cap.read()
                if not success:
                    continue

                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                
                ts_ms = int(time.time() * 1000)
                if ts_ms <= last_ts_ms:       # M2 loop can outrun 1ms resolution
                    ts_ms = last_ts_ms + 1
                last_ts_ms = ts_ms
                landmarker.detect_async(mp_image, ts_ms)
                
    except Exception as e:
        print(json.dumps({"engineStatus": "error", "message": str(e)}))
        sys.stdout.flush()
    finally:
        cap.release()

    return 0