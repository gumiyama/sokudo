import cv2
import numpy as np
from flask import Flask, render_template, Response
import time

app = Flask(__name__)

# ボール検出のための設定
lower_color = np.array([0, 0, 100])  # HSV色空間での野球ボールの下限値（白色）
upper_color = np.array([180, 30, 255])  # HSV色空間での野球ボールの上限値（白色）

# 野球場の寸法（メートル）
PITCHER_PLATE_TO_HOME = 18.44

# カメラのキャリブレーション値（例：1メートルあたりのピクセル数）
PIXELS_PER_METER = 50  # この値は実際のセットアップに応じて調整する必要があります

# ボールの位置と時間を記録するリスト
ball_positions = []
ball_times = []

def detect_ball(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, lower_color, upper_color)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    for contour in contours:
        area = cv2.contourArea(contour)
        if 50 < area < 500:  # ボールのサイズに応じて調整
            M = cv2.moments(contour)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                return (cx, cy)
    return None

def calculate_speed(positions, times):
    if len(positions) < 2 or len(times) < 2:
        return None
    
    pixel_distance = np.linalg.norm(np.array(positions[-1]) - np.array(positions[0]))
    real_distance = pixel_distance / PIXELS_PER_METER
    time_diff = times[-1] - times[0]
    
    if time_diff == 0:
        return None
    
    speed_mps = real_distance / time_diff
    return speed_mps * 3.6  # m/sからkm/hに変換

def process_frame(frame):
    ball_position = detect_ball(frame)
    if ball_position:
        ball_positions.append(ball_position)
        ball_times.append(time.time())
        
        # 最新の10フレームだけを保持
        if len(ball_positions) > 10:
            ball_positions.pop(0)
            ball_times.pop(0)
        
        speed = calculate_speed(ball_positions, ball_times)
        if speed:
            cv2.putText(frame, f"Speed: {speed:.2f} km/h", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    
    # 計測範囲を表示
    height, width = frame.shape[:2]
    cv2.line(frame, (0, height//2), (width, height//2), (0, 0, 255), 2)  # 中心線
    
    return frame

def gen_frames():
    camera = cv2.VideoCapture(0)
    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            frame = process_frame(frame)
            ret, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(gen_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    app.run(debug=True)
