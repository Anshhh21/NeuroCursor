"""Application entry and loop helpers."""
import json
import sys
import time
import cv2
import mediapipe as mp
import os
import math
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

    # --- MJPEG SERVER ---
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from socketserver import ThreadingMixIn

    global_frame = None

    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        pass

    class CamHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.endswith('.mjpg'):
                self.send_response(200)
                self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=--jpgboundary')
                self.end_headers()
                while True:
                    try:
                        if global_frame is not None:
                            ret, jpeg = cv2.imencode('.jpg', global_frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
                            self.wfile.write(b'--jpgboundary\r\n')
                            self.send_header('Content-type', 'image/jpeg')
                            self.send_header('Content-length', str(len(jpeg.tobytes())))
                            self.end_headers()
                            self.wfile.write(jpeg.tobytes())
                            self.wfile.write(b'\r\n')
                        time.sleep(0.033)
                    except Exception:
                        break
            else:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'OK')

        def log_message(self, format, *args):
            pass 

    mjpeg_port = 49152
    server = ThreadingHTTPServer(('127.0.0.1', mjpeg_port), CamHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    # --------------------

    # ── Pause/Resume toggle state ─────────────────────────────────────────
    # Open palm once = pause.  Open palm again = resume.  No fist needed.
    cursor_paused = False  # Is the cursor currently frozen?
    prev_palm     = False  # Was the last frame an open palm? (rising-edge guard)

    def print_result(result, output_image, timestamp_ms: int):
        nonlocal cursor_paused, prev_palm
        if result.hand_landmarks:
            for hand_landmarks, handedness in zip(result.hand_landmarks, result.handedness):
                
                # whether pip gave you a Protobuf OR a Py list this made me cry 
                lm = hand_landmarks.landmark if hasattr(hand_landmarks, 'landmark') else hand_landmarks
                hd = handedness.classification if hasattr(handedness, 'classification') else handedness
                hand_name = getattr(hd[0], 'category_name', getattr(hd[0], 'label', "Unknown"))
                
                
                thumb_tip = lm[4]
                index_tip = lm[8]
                middle_tip = lm[12]
                ring_tip = lm[16]
                pinky_tip = lm[20]

                # finger up detection
                index_up = index_tip.y < lm[6].y
                middle_up = middle_tip.y < lm[10].y
                ring_up = ring_tip.y < lm[14].y
                pinky_up = pinky_tip.y < lm[18].y
                
                fingers_up_count = sum([index_up, middle_up, ring_up, pinky_up])
                pinch_dist = get_distance(index_tip, thumb_tip)
                is_pinching = pinch_dist < 0.05 

                # Set default event
                current_event = "tracking"

                is_palm = (fingers_up_count == 4)

                # Rising-edge toggle: only fires the moment the palm first appears
                # (prevents a 1-second palm from toggling 30 times)
                if is_palm and not prev_palm:
                    cursor_paused = not cursor_paused
                prev_palm = is_palm

                if cursor_paused:
                    current_event = "pause"
                elif is_pinching:
                    current_event = "left-click"
                elif index_up and middle_up and not ring_up and not pinky_up:
                    current_event = "scroll"
                # else: stays "tracking"
                
                # Send the final package to React
                telemetry = {
                    "event": current_event,
                    "hand": hand_name,
                    "x": index_tip.x,
                    "y": index_tip.y,
                    "timestamp": timestamp_ms
                }
                
                try:
                    print(json.dumps(telemetry))
                    sys.stdout.flush()
                except (BrokenPipeError, IOError):
                    os._exit(0)  # Parent process closed stdout — exit Python immediately to release webcam
        else:
            # No hand visible — reset so next palm correctly triggers the toggle
            prev_palm = False

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

                global global_frame
                global_frame = frame

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