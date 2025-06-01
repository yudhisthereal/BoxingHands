let isRunning = false;
let lastPunchTimestamp = 0;
const punchTimeout = 2000;
let punchHistory = [];
let lastPunchType = "";
let lastDeviceId = "";
let punchSequence = [];
let comboTimeout = null;

const toggleBacksound = document.getElementById("toggle-backsound");
const toggleSFX = document.getElementById("toggle-sfx");

const backgroundMusic = document.getElementById("backgroundMusic");
let isSFXEnabled = true;
let isBacksoundEnabled = true;

const accel3DHistory = {
  left: { x: [], y: [], z: [] },
  right: { x: [], y: [], z: [] },
};

// Auto toggle label & tab
document.getElementById("graphToggle").addEventListener("change", function () {
  const isChecked = this.checked;
  const label = document.getElementById("graphToggleLabel");
  const chartTab = document.getElementById("chart-tab");
  const visualTab = document.getElementById("visual-tab");

  if (isChecked) {
    label.textContent = "Visual 3D";
    chartTab.classList.add("hidden");
    visualTab.classList.remove("hidden");

    if (!window.visualTabInitialized) {
      initialize3DPlot("leftAccel3D");
      initialize3DPlot("rightAccel3D");
      window.visualTabInitialized = true;
    }
  } else {
    label.textContent = "Visual 3D";
    chartTab.classList.remove("hidden");
    visualTab.classList.add("hidden");
  }
});

const charts = {
  leftaccel: createChart("accelLeftChart", "red", "green", "blue", -50, 50),
  leftgyro: createChart("gyroLeftChart", "orange", "purple", "cyan", -10, 10),
  rightaccel: createChart("accelRightChart", "red", "green", "blue", -50, 50),
  rightgyro: createChart("gyroRightChart", "orange", "purple", "cyan", -10, 10),
};

function createChart(canvasId, colorX, colorY, colorZ, yMin, yMax) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "X", data: [], borderColor: colorX, fill: false },
        { label: "Y", data: [], borderColor: colorY, fill: false },
        { label: "Z", data: [], borderColor: colorZ, fill: false },
      ],
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        y: {
          min: yMin,
          max: yMax,
          ticks: { stepSize: (yMax - yMin) / 10 },
        },
      },
    },
  });
  chart.originalColors = [colorX, colorY, colorZ];
  return chart;
}

function updateCharts(chart, accelOrGyro, data) {
  const timestamp = new Date().toLocaleTimeString();
  chart.data.labels.push(timestamp);
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets.forEach((ds) => ds.data.shift());
  }

  ["X", "Y", "Z"].forEach((axis, i) => {
    chart.data.datasets[i].data.push(data[accelOrGyro][i]);
    chart.data.datasets[i].borderColor = isRunning
      ? chart.originalColors[i]
      : "gray";
  });

  chart.update();
}

function playRandomSound() {
  let lastIndex = -1;
  let randomIndex;

  if (!isSFXEnabled || !isRunning) {
    // Jika SFX dimatikan, jangan putar suara
    return;
  }

  const mp3Files = [
    "static/sounds/ComboDeadly.mp3",
    "static/sounds/ComboGreatStreak.mp3",
    "static/sounds/ComboImpresive.mp3",
    "static/sounds/ComboNiceMove.mp3",
    "static/sounds/ComboNiceWork.mp3",
  ];

  do {
    randomIndex = Math.floor(Math.random() * mp3Files.length);
  } while (randomIndex === lastIndex && mp3Files.length > 1);

  lastIndex = randomIndex;

  const audio = document.getElementById("comboSound");
  audio.src = mp3Files[randomIndex];
  audio.volume = audio.play(); //0.5; play 50%
}

async function fetchAndUpdate(endpoint, prefix) {
  if (!isRunning) {
    ["accel", "gyro"].forEach((type) => {
      const chart = charts[`${prefix}${type}`];
      chart.data.datasets.forEach((ds) => (ds.borderColor = "gray"));
      chart.update();
    });
    return;
  }

  try {
    const res = await fetch(endpoint);
    const data = await res.json();
    updateCharts(charts[`${prefix}accel`], "accel", data);
    updateCharts(charts[`${prefix}gyro`], "gyro", data);
  } catch (err) {
    console.error(`Fetch error for ${prefix}:`, err);
  }
}

function updatePunchDisplay() {
  const box = document.getElementById("punchBox");
  if (punchSequence.length === 0) {
    box.textContent = "NO PUNCH";
  } else {
    const latest = punchSequence[punchSequence.length - 1];
    box.innerHTML = `
          <div class="text-xl">${punchSequence.slice(0, -1).join(" → ")}</div>
          <div class="text-3xl font-bold text-blue-600">${latest}</div>
        `;
  }
}

async function fetchPunchClassification() {
  try {
    const res = await fetch("/last_punch");
    const punchArray = await res.json();

    if (punchArray.length > 0) {
      const punchData = punchArray.reduce((latest, current) =>
        new Date(current.timestamp) > new Date(latest.timestamp)
          ? current
          : latest
      );

      const newTimestamp = new Date(punchData.timestamp).getTime();

      if (
        newTimestamp !== lastPunchTimestamp ||
        punchData.punch_type !== lastPunchType ||
        punchData.device_id !== lastDeviceId
      ) {
        lastPunchTimestamp = newTimestamp;
        lastPunchType = punchData.punch_type;
        lastDeviceId = punchData.device_id;

        // Update sequence and trim to max 10
        punchSequence.push(punchData.punch_type);
        if (punchSequence.length > 10) punchSequence.shift();

        updatePunchDisplay();
        playPunchSound(punchData.punch_type);

        if (comboTimeout) clearTimeout(comboTimeout);
        comboTimeout = setTimeout(() => {
          playRandomSound();
          punchSequence = [];
          updatePunchDisplay();
        }, 2000); // waktu tunggu 2 detik setelah pukulan terakhir

        // Update table
        const row = document.createElement("tr");
        row.innerHTML = `
              <td class="py-1 px-4 border">${punchData.timestamp}</td>
              <td class="py-1 px-4 border">${punchData.device_id}</td>
              <td class="py-1 px-4 border font-bold text-blue-600">${punchData.punch_type}</td>
            `;

        const table = document.getElementById("punchLogTable");
        if (table.querySelector("td.italic")) table.innerHTML = "";
        table.prepend(row);
        while (table.rows.length > 10) table.deleteRow(-1);
      }
    }
  } catch (e) {
    console.error("Gagal fetch punch_type:", e);
  }
}

function playPunchSound(punchType) {
  if (!isSFXEnabled) return;

  const soundMap = {
    JAB: document.getElementById("jabSound"),
    STRAIGHT: document.getElementById("straightSound"),
    UPPERCUT: document.getElementById("uppercutSound"),
    HOOK: document.getElementById("hookSound"),
  };

  const sound =
    soundMap[punchType.toUpperCase()] ||
    document.getElementById("defaultSound");

  if (sound) {
    sound.currentTime = 0;
    sound.play().catch((e) => console.log("Sound effect play error:", e));
  } else {
    console.warn("Punch type tidak dikenal:", punchType);
  }
}

setInterval(() => {
  fetchAndUpdate("/data/left", "left");
  fetchAndUpdate("/data/right", "right");

  if (isRunning) {
    fetchPunchClassification();

    // Check if punch is too old, then show "NO PUNCH"
    if (Date.now() - lastPunchTimestamp > punchTimeout) {
      punchSequence = [];
      updatePunchDisplay();
    }
  }
}, 100);

if (!isRunning) {
  document.getElementById("punchBox").textContent = "NO PUNCH";
}

const toggleButton = document.getElementById("toggleButton");
const statusText = document.getElementById("statusText");
const statusDot = document.querySelector("#statusIndicator span");

toggleButton.addEventListener("click", async () => {
  const status = isRunning ? "off" : "on";

  const sound = isRunning
    ? document.getElementById("stopSound")
    : document.getElementById("startSound");
  sound.currentTime = 0;
  sound.play().catch((err) => console.warn("Audio play error:", err));

  const backgroundMusic = document.getElementById("backgroundMusic");

  try {
    await fetch("/mqtt-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  } catch (e) {
    console.error("Failed to send MQTT command", e);
  }

  isRunning = !isRunning;

  if (isRunning && isBacksoundEnabled) {
    setTimeout(() => {
      backgroundMusic.currentTime = 0;
      backgroundMusic
        .play()
        .catch((err) => console.warn("Backsound error:", err));
    }, 2000);
    backgroundMusic.volume = 0.2; // 20% volume
  } else {
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
  }

  toggleButton.textContent = isRunning ? "Akhiri Latihan" : "Mulai Latihan";
  statusText.textContent = isRunning ? "ON" : "OFF";
  toggleButton.classList.toggle("bg-blue-600", isRunning);
  toggleButton.classList.toggle("bg-gray-400", !isRunning);

  statusText.textContent = isRunning ? "ON" : "OFF";
  statusDot.className = `inline-block w-2 h-2 rounded-full mr-1 align-middle ${
    isRunning ? "bg-green-500" : "bg-gray-400"
  }`;
});

document.getElementById("toggle-backsound").addEventListener("change", (e) => {
  isBacksoundEnabled = e.target.checked;
  if (!isBacksoundEnabled) {
    backgroundMusic.pause();
  }
});

document.getElementById("toggle-sfx").addEventListener("change", (e) => {
  isSFXEnabled = e.target.checked;
});

// Toggle backsound
toggleBacksound.addEventListener("change", () => {
  if (toggleBacksound.checked) {
    backgroundMusic.volume = 0.2;
    backgroundMusic
      .play()
      .catch((e) => console.log("Backsound play error:", e));
  } else {
    backgroundMusic.pause();
  }
});

// Toggle SFX
toggleSFX.addEventListener("change", () => {
  isSFXEnabled = toggleSFX.checked;
});

// Fungsi untuk menginisialisasi plot 3D
function initialize3DPlot(id) {
  Plotly.newPlot(
    id,
    [
      {
        type: "scatter3d",
        mode: "lines+markers",
        x: [[]], // empty trace
        y: [[]],
        z: [[]],
        name: "Accel Data",
        marker: {
          size: 4,
          color: id.includes("left") ? "red" : "blue",
        },
        line: {
          width: 4,
          color: id.includes("left") ? "red" : "blue",
        },
      },
    ],
    {
      responsive: false,
      margin: { l: 0, r: 0, b: 0, t: 0 },
      scene: {
        xaxis: { range: [-50, 50] },
        yaxis: { range: [-50, 50] },
        zaxis: { range: [-50, 50] },
      },
    }
  );
}


// Matriks rotasi untuk transformasi data sensor
function rotateVector(vector, angle, axis) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const rotationMatrix = {
    x: [
      [1, 0, 0],
      [0, cosA, -sinA],
      [0, sinA, cosA],
    ],
    y: [
      [cosA, 0, sinA],
      [0, 1, 0],
      [-sinA, 0, cosA],
    ],
    z: [
      [cosA, -sinA, 0],
      [sinA, cosA, 0],
      [0, 0, 1],
    ],
  };

  const matrix = rotationMatrix[axis]; // Pilih sumbu rotasi (x, y, z)

  // Lakukan perkalian matriks antara vektor data dan matriks rotasi
  const rotatedVector = [
    matrix[0][0] * vector[0] +
      matrix[0][1] * vector[1] +
      matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] +
      matrix[1][1] * vector[1] +
      matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] +
      matrix[2][1] * vector[1] +
      matrix[2][2] * vector[2],
  ];

  return rotatedVector;
}

// Fungsi untuk menyesuaikan data akselerometer dan giroskop berdasarkan orientasi sensor
function adjustSensorData(accelData, gyroData, orientation) {
  let rotatedAccel = accelData;
  let rotatedGyro = gyroData;

  // Misalnya, jika orientasi sensor diubah (ke atas atau ke bawah), lakukan rotasi
  if (orientation === "up") {
    rotatedAccel = rotateVector(accelData, Math.PI / 2, "x"); // Rotasi 90 derajat di sumbu X
    rotatedGyro = rotateVector(gyroData, Math.PI / 2, "x"); // Rotasi 90 derajat di sumbu X
  } else if (orientation === "down") {
    rotatedAccel = rotateVector(accelData, -Math.PI / 2, "x"); // Rotasi -90 derajat di sumbu X
    rotatedGyro = rotateVector(gyroData, -Math.PI / 2, "x"); // Rotasi -90 derajat di sumbu X
  }
  // Tambahkan orientasi lainnya jika perlu

  return {
    accel: rotatedAccel,
    gyro: rotatedGyro,
  };
}

// Fungsi untuk memperbarui plot 3D dengan data akselerometer baru
function updateAccel3D(side, data) {
  const plotId = `${side}Accel3D`;
  if (!data || !data.accel || data.accel.length !== 3) return;

  const x = side === "left" ? -data.accel[0] : data.accel[0];
  const y = data.accel[1];
  const z = data.accel[2];

  Plotly.extendTraces(
    plotId,
    {
      x: [[x]],
      y: [[y]],
      z: [[z]],
    },
    [0],
    10 // max 10 points kept
  );
}


// Fungsi untuk mengambil data accelerometer dari server
async function fetchAccelData() {
  try {
    const responseLeft = await fetch("/data/left");
    const dataLeft = await responseLeft.json();
    const responseRight = await fetch("/data/right");
    const dataRight = await responseRight.json();

    console.log("Data imu kiri:", dataLeft);
    console.log("Data imu kanan:", dataRight);

    // Pastikan data valid sebelum update grafik 3D
    if (isRunning && dataLeft.accel && dataRight.accel) {
      updateAccel3D("left", dataLeft);
      updateAccel3D("right", dataRight);

      // Tambahkan pembaruan grafik untuk akselerometer dan giroskop
      updateCharts(charts["leftaccel"], "accel", dataLeft);
      updateCharts(charts["leftgyro"], "gyro", dataLeft);
      updateCharts(charts["rightaccel"], "accel", dataRight);
      updateCharts(charts["rightgyro"], "gyro", dataRight);
    }
  } catch (error) {
    console.error("Error fetching accelerometer data:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initialize3DPlot("leftAccel3D");
  initialize3DPlot("rightAccel3D");
  console.log("Inisialisasi 3D selesai.");
});

setInterval(fetchAccelData, 50);
