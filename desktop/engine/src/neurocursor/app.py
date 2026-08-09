"""Application entry and loop helpers."""
import json
import sys
import time
import cv2
import mediapipe as mp
import os
import math
from neurocursor import __version__

# Helper to calculate distance for pinch detection
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

    # --- PyInstaller File Path Magic ---
    if getattr(sys, 'frozen', False):
        model_path = os.path.join(sys._MEIPASS, 'neurocursor', 'hand_landmarker.task')
    else:
        model_path = os.path.join(os.path.dirname(__file__), 'hand_landmarker.task')
    
    BaseOptions = mp.tasks.BaseOptions
    HandLandmarker = mp.tasks.vision.HandLandmarker
    HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
    VisionRunningMode = mp.tasks.vision.RunningMode

    def print_result(result, output_image, timestamp_ms: int):
        if result.hand_landmarks:
            for hand_landmarks, handedness in zip(result.hand_landmarks, result.handedness):
                
                # --- BUG FIX: MediaPipe Version Data Extraction ---
                # Safely extracts data whether pip gave you a Protobuf OR a Python list!
                lm = hand_landmarks.landmark if hasattr(hand_landmarks, 'landmark') else hand_landmarks
                hd = handedness.classification if hasattr(handedness, 'classification') else handedness
                hand_name = getattr(hd[0], 'category_name', getattr(hd[0], 'label', "Unknown"))
                # --------------------------------------------------
                
                thumb_tip = lm[4]
                index_tip = lm[8]
                middle_tip = lm[12]
                ring_tip = lm[16]
                pinky_tip = lm[20]

                # Finger up detection logic
                index_up = index_tip.y < lm[6].y
                middle_up = middle_tip.y < lm[10].y
                ring_up = ring_tip.y < lm[14].y
                pinky_up = pinky_tip.y < lm[18].y
                
                fingers_up_count = sum([index_up, middle_up, ring_up, pinky_up])
                pinch_dist = get_distance(index_tip, thumb_tip)
                is_pinching = pinch_dist < 0.05 

                # Set default event
                current_event = "tracking" 

                if is_pinching:
                    current_event = "right-click"
                elif fingers_up_count == 4:
                    current_event = "pause"      
                elif fingers_up_count == 0:
                    current_event = "resume"     
                elif index_up and middle_up and not ring_up and not pinky_up:
                    current_event = "scroll"     
                
                # Send the final package to React
                telemetry = {
                    "event": current_event,
                    "hand": hand_name,
                    "x": index_tip.x,
                    "y": index_tip.y,
                    "timestamp": timestamp_ms
                }
                
                print(json.dumps(telemetry))
                sys.stdout.flush()

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.LIVE_STREAM,
        result_callback=print_result,
        num_hands=1
    )

    cap = cv2.VideoCapture(0)
    
    try:
        with HandLandmarker.create_from_options(options) as landmarker:
            while cap.isOpened():
                success, frame = cap.read()
                if not success:
                    continue

                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                
                landmarker.detect_async(mp_image, int(time.time() * 1000))
                
    except Exception as e:
        print(json.dumps({"engineStatus": "error", "message": str(e)}))
        sys.stdout.flush()
    finally:
        cap.release()

    return 0