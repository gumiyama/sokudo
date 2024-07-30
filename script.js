document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const startBtn = document.getElementById('start-btn');
    const switchCameraBtn = document.getElementById('switch-camera-btn');
    const speedDisplay = document.getElementById('speed');
    const statusMessage = document.getElementById('status-message');
    const body = document.body;

    let measuring = false;
    let lastBallPosition = null;
    let lastBallTime = null;
    let lastSpeed = null;
    let speedHoldTimeout = null;
    let lastSpeedUpdateTime = null;
    let startTime = null;
    const MEASURE_DELAY = 1000; // 1秒間の遅延
    const SPEED_HOLD_TIME = 5000; // 5秒間速度を表示
    const SPEED_UPDATE_INTERVAL = 5000; // 5秒ごとに速度を更新
    const CAMERA_ANGLE = 45; // カメラの斜め角度（度数法）
    const MIN_DISTANCE = 10; // 最小距離ピクセル単位

    let currentCamera = 'environment'; // デフォルトはバックカメラ
    let currentStream = null; // 現在のカメラストリームを保持

    // カメラを切り替える関数
    async function switchCamera() {
        currentCamera = currentCamera === 'user' ? 'environment' : 'user';
        await setupCamera();
    }

    // カメラの設定
    async function setupCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        const constraints = {
            video: { facingMode: currentCamera }
        };
        try {
            console.log("Requesting camera access");
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            currentStream = stream;
            console.log("Stream obtained: ", stream);
            video.addEventListener('loadeddata', () => {
                console.log("Video data loaded");
                statusMessage.textContent = 'カメラの接続に成功しました。';
                startBtn.disabled = false;
            });
        } catch (err) {
            console.error("カメラの起動に失敗しました:", err);
            statusMessage.textContent = `カメラの起動に失敗しました: ${err.message}`;
            startBtn.disabled = true;
        }
    }

    setupCamera();

    // カメラ切り替えボタンのイベントリスナー
    switchCameraBtn.addEventListener('click', switchCamera);

    // ボールの検出（簡易版）
    function detectBall(imageData) {
        let maxBrightness = 0;
        let ballX = 0, ballY = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
            const brightness = (imageData.data[i] + imageData.data[i+1] + imageData.data[i+2]) / 3;
            if (brightness > maxBrightness) {
                maxBrightness = brightness;
                ballX = (i / 4) % canvas.width;
                ballY = Math.floor((i / 4) / canvas.width);
            }
        }
        console.log(`Ball position: x=${ballX}, y=${ballY}`);
        return { x: ballX, y: ballY };
    }

    // 速度の計算
    function calculateAndDisplaySpeed(currentPosition, currentTime) {
        if (lastBallPosition && lastBallTime && (currentTime - startTime) >= MEASURE_DELAY) {
            const distance = Math.sqrt(
Math.pow(currentPosition.x - lastBallPosition.x, 2) +
                Math.pow(currentPosition.y - lastBallPosition.y, 2)
            );
            const time = (currentTime - lastBallTime) / 1000;
            const speedPixelsPerSecond = distance / time;

            // 斜め角度の補正
            const speedKmPerHour = speedPixelsPerSecond * 0.1 / Math.cos(CAMERA_ANGLE * Math.PI / 180);
            console.log(`Calculated speed: ${speedKmPerHour.toFixed(2)} km/h`);

            // 前回の速度と比較し、急激な変化がないか確認
            if (lastSpeed !== null && Math.abs(speedKmPerHour - lastSpeed) > 100) {
                console.log("Unrealistic speed change detected, ignoring this value");
                return;
            }

            if (distance < MIN_DISTANCE) {
                console.log("Movement distance too small, ignoring this value");
                return;
            }

            lastSpeed = speedKmPerHour.toFixed(2);
            speedDisplay.textContent = lastSpeed;
            lastSpeedUpdateTime = currentTime;

            clearTimeout(speedHoldTimeout);
            speedHoldTimeout = setTimeout(() => {
                speedDisplay.textContent = "0";
            }, SPEED_HOLD_TIME);
        }
    }

    // フレームの処理
    function processFrame() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            if (measuring) {
                const ballPosition = detectBall(imageData);
                const currentTime = new Date().getTime();
                calculateAndDisplaySpeed(ballPosition, currentTime);

                lastBallPosition = ballPosition;
                lastBallTime = currentTime;

                ctx.beginPath();
                ctx.arc(ballPosition.x, ballPosition.y, 5, 0, 2 * Math.PI);
                ctx.fillStyle = 'red';
                ctx.fill();
            }
        }

        requestAnimationFrame(processFrame);
    }

    startBtn.addEventListener('click', () => {
        measuring = !measuring;
        startBtn.textContent = measuring ? '計測停止' : '計測開始';
        body.style.backgroundColor = measuring ? '#f8d7da' : ''; // 計測中は背景色を変更
        statusMessage.textContent = measuring ? '計測中...' : '';
        if (measuring) {
            startTime = new Date().getTime();
            lastBallPosition = null;
            lastBallTime = null;
            lastSpeed = null;
            lastSpeedUpdateTime = null;
            clearTimeout(speedHoldTimeout);
            speedDisplay.textContent = "0";
        } else {
            clearTimeout(speedHoldTimeout);
            speedDisplay.textContent = "0";
        }
    });

    video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log("Video metadata loaded, starting frame processing");
        processFrame();
    });
});