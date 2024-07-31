import cv2
import numpy as np
from flask import Flask, render_template, Response
import time
from filterpy.kalman import KalmanFilter

app = Flask(__name__)

# ボール検出のための設定
lower_color = np.array([0, 50, 100])
upper_color = np.array([180, 150, 255])

# 野球場の寸法（メートル）
PITCHER_PLATE_TO_HOME = 18.44

# カメラのキャリブレーション値
PIXELS_PER_METER = 50

# カルマンフィルターの初期化
kf = KalmanFilter(dim_x=4, dim_z=2)
kf.F = np.array([[1, 0, 1, 0],
                 [0, 1, 0, 1],
                 [0, 0, 1, 0],
                 [0, 0, 0, 1]])
kf.H = np.array([[1, 0, 0, 0],
                 [0, 1, 0, 0]])
kf.R *= 5
kf.Q = np.eye(4) * 0.05

ball_positions = []
ball_times = []

def detect_ball(frame):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, lower_color, upper_color)
    mask = cv2.erode(mask, None, iterations=2)
    mask = cv2.dilate(mask, None, iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    for contour in contours:
        area = cv2.contourArea(contour)
        if 50 < area < 500:
            M = cv2.moments(contour)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                return (cx, cy)
    return None

def calculate_speed(positions, times):
    if len(positions) < 2 or len(times) < 2:
        return None
    
    # 3D空間での速度計算（Z軸は推定）
    pixel_distance_2d = np.linalg.norm(np.array(positions[-1]) - np.array(positions[0]))
    time_diff = times[-1] - times[0]
    
    if time_diff == 0:
        return None
    
    # Z軸の変化を推定（例：ボールが放物線を描くと仮定）
    z_change = 0.5 * 9.8 * (time_diff ** 2)  # 自由落下の式
    
    real_distance_3d = np.sqrt((pixel_distance_2d / PIXELS_PER_METER) ** 2 + z_change ** 2)
    speed_mps = real_distance_3d / time_diff
    return speed_mps * 3.6

def process_frame(frame):
    ball_position = detect_ball(frame)
    if ball_position:
        kf.predict()
        kf.update(np.array(ball_position))
        filtered_position = kf.x[:2]
        
        ball_positions.append(filtered_position)
        ball_times.append(time.time())
        
        if len(ball_positions) > 10:
            ball_positions.pop(0)
            ball_times.pop(0)
        
        speed = calculate_speed(ball_positions, ball_times)
        if speed:
            # 移動平均を使用して速度を平滑化
            smoothed_speed = np.mean([calculate_speed(ball_positions[i:], ball_times[i:]) for i in range(len(ball_positions))])
            cv2.putText(frame, f"Speed: {smoothed_speed:.2f} km/h", (10, 30),
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
