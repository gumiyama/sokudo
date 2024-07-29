document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const startBtn = document.getElementById('start-btn');
    const speedDisplay = document.getElementById('speed');
    const statusMessage = document.getElementById('status-message');

    let measuring = false;
    let lastBallPosition = null;
    let lastBallTime = null;

    // カメラの設定
    async function setupCamera() {
        try {
            console.log("Requesting camera access");
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
            console.log("Stream obtained: ", stream);
            video.addEventListener('loadeddata', () => {
                console.log("Video data loaded");
                statusMessage.textContent = 'カメラの接続に成功しました。';
                startBtn.disabled = false;
            });
        } catch (err) {
            console.error("カメラの起動に失敗しました:", err);
            statusMessage.textContent = `カメラの起動に失敗しました: ${err.message}`;
        }
    }

    setupCamera();

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
    function calculateSpeed(currentPosition, currentTime) {
        if (lastBallPosition && lastBallTime) {
            const distance = Math.sqrt(
                Math.pow(currentPosition.x - lastBallPosition.x, 2) +
                Math.pow(currentPosition.y - lastBallPosition.y, 2)
            );
            const time = (currentTime - lastBallTime) / 1000; // 秒に変換
            const speedPixelsPerSecond = distance / time;
            // ピクセルから実際の速度への変換（仮の係数）
            const speedKmPerHour = speedPixelsPerSecond * 0.1;
            console.log(`Calculated speed: ${speedKmPerHour.toFixed(2)} km/h`);
            return speedKmPerHour.toFixed(2);
        }
        return null;
    }

    // フレームの処理
    function processFrame() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            if (measuring) {
                const ballPosition = detectBall(imageData);
                const currentTime = new Date().getTime();
                const speed = calculateSpeed(ballPosition, currentTime);
                
                if (speed) {
                    speedDisplay.textContent = speed;
                }
                
                lastBallPosition = ballPosition;
                lastBallTime = currentTime;
                
                // ボールの位置に円を描画
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
        if (measuring) {
            lastBallPosition = null;
            lastBallTime = null;
        }
    });

    video.addEventListener('loadedmetadata', () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log("Video metadata loaded, starting frame processing");
        processFrame();
    });
});
